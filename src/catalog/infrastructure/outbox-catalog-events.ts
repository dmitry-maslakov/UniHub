import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { Outbox } from '@nestjs/outbox';
import {
  CatalogEvents,
  type FileContentChanged,
  type FileRemoved,
  type ItemChanged,
  type ItemRemoved,
} from '../domain/events.js';
import {
  FILE_CONTENT_CHANGED,
  FILE_REMOVED,
  ITEM_CHANGED,
  ITEM_REMOVED,
} from '../topics.js';

// events go to the outbox through the current transaction, so they commit
// or roll back together with the change they describe
@Injectable()
export class OutboxCatalogEvents extends CatalogEvents {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
    private readonly outbox: Outbox,
  ) {
    super();
  }

  async itemChanged(payload: ItemChanged) {
    await this.outbox.add(this.txHost.tx, { topic: ITEM_CHANGED, payload });
  }

  async fileContentChanged(payload: FileContentChanged) {
    await this.outbox.add(this.txHost.tx, {
      topic: FILE_CONTENT_CHANGED,
      payload,
    });
  }

  async itemRemoved(payload: ItemRemoved) {
    await this.outbox.add(this.txHost.tx, { topic: ITEM_REMOVED, payload });
  }

  async fileRemoved(payload: FileRemoved) {
    await this.outbox.add(this.txHost.tx, { topic: FILE_REMOVED, payload });
  }
}
