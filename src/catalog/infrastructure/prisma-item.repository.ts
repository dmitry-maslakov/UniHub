import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Item as Row } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { Json } from '../domain/changes.js';
import { type Item, type ItemData, ItemRepository } from '../domain/item.js';
import { upsertTracked } from './upsert-tracked.js';

const toEntity = (row: Row): Item => ({
  ...row,
  raw: row.raw as Json,
});

@Injectable()
export class PrismaItemRepository extends ItemRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {
    super();
  }

  private get db() {
    return this.txHost.tx.item;
  }

  async findByExternalId(portal: string, externalId: string) {
    const row = await this.db.findUnique({
      where: { portal_externalId: { portal, externalId } },
    });
    return row && toEntity(row);
  }

  upsert(data: ItemData) {
    // raw is required, so it is never null here
    const values = { ...data, raw: data.raw as object };
    return upsertTracked<Item>(data, {
      find: () => this.findByExternalId(data.portal, data.externalId),
      create: async () => toEntity(await this.db.create({ data: values })),
      update: async ({ id }) =>
        toEntity(await this.db.update({ where: { id }, data: values })),
    });
  }
}
