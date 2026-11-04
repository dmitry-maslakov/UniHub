import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { Json } from '@app/kernel';
import { jsonInput } from '../../platform/database/json-input.js';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import { SyncStateRepository } from '../domain/sync-state.js';

@Injectable()
export class PrismaSyncStateRepository extends SyncStateRepository {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  async get(portal: string, account: string) {
    const row = await this.txHost.tx.syncState.findUnique({
      where: { portal_account: { portal, account } },
    });
    return (row?.state as Json | undefined) ?? null;
  }

  // a saved null reads back as null, as if none was ever saved
  async save(portal: string, account: string, state: Json) {
    await this.txHost.tx.syncState.upsert({
      where: { portal_account: { portal, account } },
      create: { portal, account, state: jsonInput(state) },
      update: { state: jsonInput(state) },
    });
  }
}
