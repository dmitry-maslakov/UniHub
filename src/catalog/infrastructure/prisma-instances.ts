import { Injectable } from '@nestjs/common';
import {
  InjectTransactionHost,
  Propagation,
  Transactional,
} from '@nestjs-cls/transactional';
import type { Instance, PortalId } from '@app/kernel';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import { Instances, type Adopted } from '../domain/instances.js';

// Each record table: its own versions, by which column, and the rows that
// name one of its records otherwise (a course's link, a post's or a file's
// course, a file's post). Constants: the raw SQL below takes them as names.
const RECORDS = [
  {
    table: 'PortalCourse',
    versions: ['CourseVersion', 'portalCourseId'],
    named: [
      ['CourseLink', 'portalCourseId'],
      ['ItemVersion', 'portalCourseId'],
      ['FileVersion', 'portalCourseId'],
    ],
  },
  {
    table: 'Item',
    versions: ['ItemVersion', 'itemId'],
    named: [['FileVersion', 'itemId']],
  },
  { table: 'File', versions: ['FileVersion', 'fileId'], named: [] },
] as const;

type Records = (typeof RECORDS)[number];

// a table's or a column's name, as SQL takes it
const name = (of: string) => Prisma.raw(`"${of}"`);

// a record kept with no site (old) beside one of the site, and which of
// the two runs sent: has versions
interface Twin {
  externalId: string;
  old: string;
  site: string;
  oldSent: boolean;
  siteSent: boolean;
}

// A record's site is stamped on its ids alone (PortalCourse, Item, File):
// its versions and sights, the events and the search index name the hub's
// ids, which stay.
@Injectable()
export class PrismaInstances extends Instances {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  @Transactional(Propagation.Mandatory)
  async adopt(portal: PortalId, instance: Instance): Promise<Adopted> {
    const { tx } = this.txHost;
    const done: Adopted = { records: 0, twice: [] };
    if (!(await this.anyLeft(portal))) return done;
    // No record goes in or changes until this commits: the trigger of
    // 20261107120000_instances, which refuses one with no site beside one
    // with it (an app from before), sees the stamped rows by then, and two
    // processes adopting take turns.
    await tx.$executeRaw`LOCK TABLE "PortalCourse", "Item", "File" IN SHARE ROW EXCLUSIVE MODE`;
    for (const records of RECORDS) {
      for (const twin of await this.twins(records, portal, instance))
        if (twin.oldSent && twin.siteSent) done.twice.push(twin.externalId);
        else await this.merge(records, twin);
      done.records += await tx.$executeRaw`
        UPDATE ${name(records.table)} o SET instance = ${instance}
        WHERE o.portal = ${portal} AND o.instance = ''
          AND NOT EXISTS (
            SELECT FROM ${name(records.table)} s
            WHERE s.portal = o.portal AND s.instance = ${instance}
              AND s."externalId" = o."externalId"
          )`;
    }
    return done;
  }

  private async anyLeft(portal: PortalId) {
    const [{ left }] = await this.txHost.tx.$queryRaw<[{ left: boolean }]>`
      SELECT EXISTS (SELECT FROM "PortalCourse" WHERE portal = ${portal} AND instance = '')
        OR EXISTS (SELECT FROM "Item" WHERE portal = ${portal} AND instance = '')
        OR EXISTS (SELECT FROM "File" WHERE portal = ${portal} AND instance = '')
        AS left`;
    return left;
  }

  private twins(
    { table, versions: [versions, by] }: Records,
    portal: PortalId,
    instance: Instance,
  ) {
    return this.txHost.tx.$queryRaw<Twin[]>`
      SELECT o."externalId", o.id AS old, s.id AS site,
        EXISTS (SELECT FROM ${name(versions)} WHERE ${name(by)} = o.id) AS "oldSent",
        EXISTS (SELECT FROM ${name(versions)} WHERE ${name(by)} = s.id) AS "siteSent"
      FROM ${name(table)} o
      JOIN ${name(table)} s ON s.portal = o.portal AND s."externalId" = o."externalId"
      WHERE o.portal = ${portal} AND o.instance = '' AND s.instance = ${instance}`;
  }

  // The twin runs sent stays, the old one when neither was (its id is the
  // one anything knows), and what named the other names it; of two
  // courses' links, the site's, which an admin made since.
  private async merge({ table, named }: Records, twin: Twin) {
    const { tx } = this.txHost;
    const [stays, goes] = twin.siteSent
      ? [twin.site, twin.old]
      : [twin.old, twin.site];
    if (table === 'PortalCourse')
      await tx.$executeRaw`
        DELETE FROM "CourseLink" WHERE "portalCourseId" = ${twin.old}
          AND EXISTS (SELECT FROM "CourseLink" WHERE "portalCourseId" = ${twin.site})`;
    for (const [rows, by] of named)
      await tx.$executeRaw`
        UPDATE ${name(rows)} SET ${name(by)} = ${stays} WHERE ${name(by)} = ${goes}`;
    await tx.$executeRaw`DELETE FROM ${name(table)} WHERE id = ${goes}`;
  }
}
