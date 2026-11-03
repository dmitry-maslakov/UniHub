import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { File as Row } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { type File, type FileData, FileRepository } from '../domain/file.js';
import { upsertTracked } from './upsert-tracked.js';

const toEntity = (row: Row): File => row;

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

  async findByExternalId(portal: string, externalId: string) {
    const row = await this.db.findUnique({
      where: { portal_externalId: { portal, externalId } },
    });
    return row && toEntity(row);
  }

  upsert(data: FileData) {
    return upsertTracked<File>(data, {
      find: () => this.findByExternalId(data.portal, data.externalId),
      create: async () => toEntity(await this.db.create({ data })),
      update: async ({ id }) =>
        toEntity(await this.db.update({ where: { id }, data })),
    });
  }

  async setContentHash(id: string, hash: string) {
    // `not` alone would skip rows where contentHash is still null
    const { count } = await this.db.updateMany({
      where: {
        id,
        OR: [{ contentHash: null }, { contentHash: { not: hash } }],
      },
      data: { contentHash: hash },
    });
    return count > 0;
  }
}
