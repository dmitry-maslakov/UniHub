import { Injectable } from '@nestjs/common';
import {
  InjectTransactionHost,
  Propagation,
  Transactional,
} from '@nestjs-cls/transactional';
import type { Json, PortalId } from '@app/kernel';
import {
  Prisma,
  type PortalCourse as Row,
} from '../../generated/prisma/client.js';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import { PortalCourse } from '../domain/portal-course/portal-course.js';
import { PortalCourseRepository } from '../domain/portal-course/portal-course.repository.js';
import type { PortalRef } from '../domain/portal-ref.js';
import { byPortalRef } from './by-portal-ref.js';
import { CatalogOutbox } from './catalog-outbox.js';
import { LOCK, lockRecord } from './record-lock.js';

const toPortalCourse = (row: Row) =>
  PortalCourse.restore({
    id: row.id,
    ref: { portal: row.portal as PortalId, externalId: row.externalId },
    props: { name: row.name, url: row.url, meta: row.meta as Json | null },
  });

@Injectable()
export class PrismaPortalCourseRepository extends PortalCourseRepository {
  constructor(
    @InjectTransactionHost() private readonly txHost: PrismaTxHost,
    private readonly outbox: CatalogOutbox,
  ) {
    super();
  }

  @Transactional(Propagation.Mandatory)
  async getForUpdate(ref: PortalRef) {
    await lockRecord(this.txHost.tx, LOCK.course, ref);
    return this.findByRef(ref);
  }

  async findByRef(ref: PortalRef) {
    const row = await this.txHost.tx.portalCourse.findUnique({
      where: byPortalRef(ref),
    });
    return row && toPortalCourse(row);
  }

  @Transactional(Propagation.Mandatory)
  async save(course: PortalCourse) {
    if (course.dirty) {
      const { id, ref, props } = course.snapshot;
      const data = {
        portal: ref.portal,
        externalId: ref.externalId,
        ...props,
        // no meta is no value at all, not a json null
        meta: props.meta === null ? Prisma.DbNull : props.meta,
      };
      await this.txHost.tx.portalCourse.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
    }
    await this.outbox.write(course);
  }
}
