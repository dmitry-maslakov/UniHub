import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { PrismaService } from '../../prisma/prisma.service.js';
import {
  Prisma,
  type PortalCourse as Row,
} from '../../generated/prisma/client.js';
import type { Json } from '@app/kernel';
import {
  type PortalCourse,
  type PortalCourseData,
  PortalCourseRepository,
} from '../domain/portal-course.js';
import { LOCK, lockRecord } from './lock.js';
import { upsertTracked } from './upsert-tracked.js';

const toEntity = (row: Row): PortalCourse => ({
  id: row.id,
  portal: row.portal,
  externalId: row.externalId,
  name: row.name,
  url: row.url,
  meta: row.meta as Json | null,
});

@Injectable()
export class PrismaPortalCourseRepository extends PortalCourseRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {
    super();
  }

  private get db() {
    return this.txHost.tx.portalCourse;
  }

  async findById(id: string) {
    const row = await this.db.findUnique({ where: { id } });
    return row && toEntity(row);
  }

  async findByExternalId(portal: string, externalId: string) {
    const row = await this.db.findUnique({
      where: { portal_externalId: { portal, externalId } },
    });
    return row && toEntity(row);
  }

  upsert(data: PortalCourseData) {
    const values = {
      ...data,
      meta: data.meta === null ? Prisma.DbNull : data.meta,
    };
    return upsertTracked<PortalCourse>(data, {
      lock: () =>
        lockRecord(this.txHost, LOCK.course, data.portal, data.externalId),
      find: () => this.findByExternalId(data.portal, data.externalId),
      create: async () => toEntity(await this.db.create({ data: values })),
      update: async ({ id }) =>
        toEntity(await this.db.update({ where: { id }, data: values })),
    });
  }
}
