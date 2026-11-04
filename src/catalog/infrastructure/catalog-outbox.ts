import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import { Outbox } from '@nestjs/outbox';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import type { CatalogAggregate, Ingested } from '../domain/aggregate.js';
import type { CatalogEvent } from '../domain/events.js';

// Writes the events an aggregate recorded to the outbox, through the
// transaction that saves it: they commit or roll back with the change they
// describe. Repositories call it from save(), so no change is saved
// without them.
@Injectable()
export class CatalogOutbox {
  constructor(
    @InjectTransactionHost() private readonly txHost: PrismaTxHost,
    private readonly outbox: Outbox,
  ) {}

  async write(aggregate: CatalogAggregate<Ingested>) {
    const events = aggregate.getUncommittedEvents();
    if (events.length)
      await this.outbox.add<CatalogEvent['payload']>(this.txHost.tx, [
        ...events,
      ]);
    aggregate.uncommit();
  }
}
