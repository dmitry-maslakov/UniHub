import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Json } from '../domain/sync-state.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { SyncStateRepository } from '../domain/sync-state.js';

@Injectable()
export class PrismaSyncStateRepository extends SyncStateRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {
    super();
  }

  async get(portal: string, account: string) {
    const row = await this.txHost.tx.syncState.findUnique({
      where: { portal_account: { portal, account } },
    });
    return (row?.state as Json | undefined) ?? null;
  }

  async save(portal: string, account: string, state: Json) {
    const value = state as object;
    await this.txHost.tx.syncState.upsert({
      where: { portal_account: { portal, account } },
      create: { portal, account, state: value },
      update: { state: value },
    });
  }
}
