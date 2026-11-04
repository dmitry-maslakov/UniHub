import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { Json } from '@app/kernel';
import { jsonInput } from '../../platform/database/json-input.js';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import type { Connection } from '../domain/connection.js';
import { SyncStateRepository } from '../domain/sync-state.js';

const byConnection = ({ portal, account }: Connection) => ({
  portal_account: { portal, account },
});

@Injectable()
export class PrismaSyncStateRepository extends SyncStateRepository {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  async get(connection: Connection) {
    const row = await this.txHost.tx.syncState.findUnique({
      where: byConnection(connection),
    });
    return (row?.state as Json | undefined) ?? null;
  }

  // a saved null reads back as null, as if none was ever saved
  async save(connection: Connection, state: Json) {
    const { portal, account } = connection;
    await this.txHost.tx.syncState.upsert({
      where: byConnection(connection),
      create: { portal, account, state: jsonInput(state) },
      update: { state: jsonInput(state) },
    });
  }
}
