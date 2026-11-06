import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  InjectTransactionHost,
  Propagation,
  Transactional,
} from '@nestjs-cls/transactional';
import { Outbox } from '@nestjs/outbox';
import type { ContentHash, PortalId } from '@app/kernel';
import { Prisma } from '../../generated/prisma/client.js';
import { jsonInput } from '../../platform/database/json-input.js';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import {
  FILE_CONTENT_CHANGED,
  ITEM_CHANGED,
  type CatalogEvent,
} from '../domain/events.js';
import type { Shown } from '../domain/publication.js';
import type { Sighting, ViewChange } from '../domain/view/view.js';
import {
  ViewRepository,
  type Kind,
  type Stamp,
  type VersionData,
} from '../domain/view/view.repository.js';
import { stampOf } from './rows.js';

// the column a kind's versions name their record by
const RECORD = {
  course: 'portalCourseId',
  item: 'itemId',
  file: 'fileId',
} as const;

@Injectable()
export class PrismaViewRepository extends ViewRepository {
  constructor(
    @InjectTransactionHost() private readonly txHost: PrismaTxHost,
    private readonly outbox: Outbox,
  ) {
    super();
  }

  // the three kinds' tables are alike: records, versions, sights
  private tables(kind: Kind) {
    const { tx } = this.txHost;
    const tables = {
      course: [tx.portalCourse, tx.courseVersion, tx.courseSight],
      item: [tx.item, tx.itemVersion, tx.itemSight],
      file: [tx.file, tx.fileVersion, tx.fileSight],
    } as const;
    const [records, versions, sights] = tables[kind];
    // one shape for the three, as Prisma's delegates can't be unioned
    return {
      records: records as unknown as typeof tx.item,
      versions: versions as unknown as typeof tx.itemVersion,
      sights: sights as unknown as typeof tx.itemSight,
    };
  }

  @Transactional(Propagation.Mandatory)
  async recordIds(
    kind: Kind,
    portal: PortalId,
    externalIds: readonly string[],
    make = true,
  ) {
    const ids = [...new Set(externalIds)];
    if (!ids.length) return new Map<string, string>();
    const { records } = this.tables(kind);
    if (make)
      await records.createMany({
        data: ids.map((externalId) => ({
          id: randomUUID(),
          portal,
          externalId,
        })),
        skipDuplicates: true,
      });
    const rows = await records.findMany({
      where: { portal, externalId: { in: ids } },
      select: { id: true, externalId: true },
    });
    return new Map(rows.map((row) => [row.externalId, row.id]));
  }

  @Transactional(Propagation.Mandatory)
  async versionOf<K extends Kind>(
    kind: K,
    recordId: string,
    fingerprint: string,
    data: VersionData[K],
  ) {
    const { versions } = this.tables(kind);
    const record = RECORD[kind];
    const id = randomUUID();
    const { count } = await versions.createMany({
      data: {
        id,
        [record]: recordId,
        fingerprint,
        ...toColumns(data),
      } as Prisma.ItemVersionCreateManyInput,
      skipDuplicates: true,
    });
    if (count) {
      await this.made(kind, id, recordId, data);
      return id;
    }
    const found = await versions.findFirstOrThrow({
      where: {
        [record]: recordId,
        fingerprint,
      } as Prisma.ItemVersionWhereInput,
      select: { id: true },
    });
    return found.id;
  }

  // A post new to the hub is news to plugins and the index; so is a file
  // version whose bytes the hub has already, from another version of them
  private async made(kind: Kind, id: string, recordId: string, data: unknown) {
    const { tx } = this.txHost;
    if (kind === 'item') {
      const { portal } = await tx.item.findUniqueOrThrow({
        where: { id: recordId },
      });
      await this.events([
        {
          topic: ITEM_CHANGED,
          payload: { portal: portal as PortalId, itemId: id },
        },
      ]);
    }
    if (kind !== 'file') return;
    const stamp = data as Stamp;
    const sibling = await tx.fileVersion.findFirst({
      where: {
        fileId: recordId,
        contentHash: { not: null },
        contentStale: false,
        ...stampOf(stamp),
      },
      select: { contentHash: true },
    });
    if (sibling?.contentHash)
      await this.storeBytes(recordId, stamp, sibling.contentHash);
  }

  async sightings(kind: Kind, account: string, portalCourseId: string | null) {
    const { sights } = this.tables(kind);
    const record = RECORD[kind];
    const rows = await sights.findMany({
      where: {
        account,
        hiddenFrom: null,
        ...(portalCourseId !== null && { version: { portalCourseId } }),
      },
      select: {
        versionId: true,
        open: true,
        version: { select: { [record]: true } as { itemId: true } },
      },
    });
    return rows.map(({ versionId, open, version }): Sighting => ({
      recordId: (version as unknown as Record<string, string>)[record],
      versionId,
      open,
    }));
  }

  @Transactional(Propagation.Mandatory)
  async apply(kind: Kind, account: string, change: ViewChange, at: Shown) {
    const { sights } = this.tables(kind);
    const now = new Date();
    const key = (versionId: string) => ({
      account_versionId: { account, versionId },
    });
    for (const { versionId, open } of change.show) {
      // one an earlier pass hides from a slot still to come stays as it
      // was, shown all along
      const { count } = await sights.updateMany({
        where: { account, versionId, open, hiddenFrom: { gt: now } },
        data: { hiddenFrom: null },
      });
      if (count) continue;
      const shown = { open, ...at, hiddenFrom: null };
      await sights.upsert({
        where: key(versionId),
        create: { account, versionId, ...shown },
        update: shown,
      });
    }
    for (const { versionId, open } of change.reopen)
      await sights.update({
        where: key(versionId),
        data: { open, openFrom: at.openFrom },
      });
    if (change.hide.length)
      await sights.updateMany({
        where: {
          account,
          versionId: { in: change.hide.map((s) => s.versionId) },
        },
        data: { hiddenFrom: at.shownFrom },
      });
  }

  @Transactional()
  async forget(account: string) {
    const { tx } = this.txHost;
    for (const sights of [tx.courseSight, tx.itemSight, tx.fileSight])
      await (sights as typeof tx.itemSight).deleteMany({ where: { account } });
  }

  @Transactional(Propagation.Mandatory)
  async storeBytes(fileId: string, stamp: Stamp, hash: string) {
    const { tx } = this.txHost;
    const waiting = await tx.fileVersion.findMany({
      where: {
        fileId,
        fingerprint: { not: null },
        contentHash: null,
        ...stampOf(stamp),
      },
      select: { id: true, file: { select: { portal: true } } },
    });
    if (!waiting.length) return false;
    await tx.fileVersion.updateMany({
      where: { id: { in: waiting.map(({ id }) => id) } },
      data: { contentHash: hash },
    });
    await this.events(
      waiting.map(({ id, file }) => ({
        topic: FILE_CONTENT_CHANGED,
        payload: {
          portal: file.portal as PortalId,
          fileId: id,
          hash: hash as ContentHash,
        },
      })),
    );
    return true;
  }

  private async events(events: CatalogEvent[]) {
    if (events.length)
      await this.outbox.add<CatalogEvent['payload']>(this.txHost.tx, events);
  }
}

// a version's columns: json as postgres takes it, sizes as bigints
function toColumns(data: unknown) {
  const { raw, meta, size, ...rest } = data as Record<string, unknown>;
  return {
    ...rest,
    ...(raw !== undefined && { raw: jsonInput(raw as never) }),
    ...(meta !== undefined && { meta: meta === null ? Prisma.DbNull : meta }),
    ...(size !== undefined && {
      size: size === null ? null : BigInt(size as number),
    }),
  };
}
