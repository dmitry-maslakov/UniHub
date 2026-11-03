import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { File as Row } from '../../generated/prisma/client.js';
import { type File, type FileData, FileRepository } from '../domain/file.js';
import { LOCK, lockRecord } from './lock.js';
import { upsertTracked } from './upsert-tracked.js';

// size is a bigint in the db (files over 2 GB), a number everywhere else
const toEntity = (row: Row): File => ({
  id: row.id,
  portal: row.portal,
  externalId: row.externalId,
  portalCourseId: row.portalCourseId,
  itemId: row.itemId,
  name: row.name,
  path: row.path,
  url: row.url,
  size: row.size === null ? null : Number(row.size),
  mime: row.mime,
  sourceUpdatedAt: row.sourceUpdatedAt,
  contentHash: row.contentHash,
  contentStale: row.contentStale,
  removedAt: row.removedAt,
});

@Injectable()
export class PrismaFileRepository extends FileRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {
    super();
  }

  private get db() {
    return this.txHost.tx.file;
  }

  async findById(id: string) {
    const row = await this.db.findUnique({ where: { id } });
    return row && toEntity(row);
  }

  async listOfCourse(courseId: string, offset: number, limit: number) {
    const rows = await this.db.findMany({
      where: {
        removedAt: null,
        portalCourse: { link: { courseId } },
        // attachments go with their post
        OR: [{ itemId: null }, { item: { removedAt: null } }],
      },
      orderBy: [{ path: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      skip: offset,
      take: limit,
    });
    return rows.map(toEntity);
  }

  async listWithContent(after: string | null, limit: number) {
    const rows = await this.db.findMany({
      where: {
        contentHash: { not: null },
        removedAt: null,
        ...(after && { id: { gt: after } }),
      },
      orderBy: { id: 'asc' },
      take: limit,
    });
    return rows.map(toEntity);
  }

  async findByExternalId(portal: string, externalId: string) {
    const row = await this.db.findUnique({
      where: { portal_externalId: { portal, externalId } },
    });
    return row && toEntity(row);
  }

  upsert(data: FileData) {
    return upsertTracked<File>(data, {
      lock: () =>
        lockRecord(this.txHost, LOCK.file, data.portal, data.externalId),
      find: () => this.findByExternalId(data.portal, data.externalId),
      create: async () => toEntity(await this.db.create({ data })),
      update: async ({ id }) =>
        toEntity(await this.db.update({ where: { id }, data })),
    });
  }

  async setContentHash(id: string, hash: string) {
    // conditional updates, so two concurrent calls can't both report a change
    // (`not` alone would skip rows where contentHash is still null)
    const { count } = await this.db.updateMany({
      where: {
        id,
        OR: [{ contentHash: null }, { contentHash: { not: hash } }],
      },
      data: { contentHash: hash, contentStale: false },
    });
    if (count === 0)
      await this.db.updateMany({
        where: { id, contentStale: true },
        data: { contentStale: false },
      });
    return count > 0;
  }

  async markContentStale(id: string) {
    await this.db.update({ where: { id }, data: { contentStale: true } });
  }

  async markRemoved(portal: string, externalId: string) {
    await lockRecord(this.txHost, LOCK.file, portal, externalId);
    const row = await this.db.findUnique({
      where: { portal_externalId: { portal, externalId } },
    });
    if (!row) return null;
    if (row.removedAt) return { id: row.id, changed: false };
    await this.db.update({
      where: { id: row.id },
      data: { removedAt: new Date() },
    });
    return { id: row.id, changed: true };
  }
}
