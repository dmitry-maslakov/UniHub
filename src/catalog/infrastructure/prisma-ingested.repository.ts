import {
  InjectTransactionHost,
  Propagation,
  Transactional,
} from '@nestjs-cls/transactional';
import { Outbox } from '@nestjs/outbox';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import type { CatalogAggregate, Ingested } from '../domain/aggregate.js';
import type { CatalogEvent } from '../domain/events.js';
import type { PortalRef } from '../domain/portal-ref.js';

export const LOCK = { course: 1, item: 2, file: 3 } as const;

// How the repositories of ingested records lock and save them; each knows
// its own table and rows.
export abstract class PrismaIngestedRepository<
  A extends CatalogAggregate<Ingested>,
> {
  protected abstract readonly lock: (typeof LOCK)[keyof typeof LOCK];

  constructor(
    @InjectTransactionHost() protected readonly txHost: PrismaTxHost,
    private readonly outbox: Outbox,
  ) {}

  abstract findByRef(ref: PortalRef): Promise<A | null>;

  // the record's state, new or saved before, by the hub's id
  protected abstract upsert(state: A['snapshot']): Promise<unknown>;

  // Two writes of the same record at once would both read "not there" and
  // collide on insert, or both read the old state and one write over the
  // other. An advisory lock on the portal's id serialises them until the
  // transaction ends, records that don't exist yet included (which a row
  // lock or a version column can't cover). Only in a transaction: without
  // one, the lock would end with the statement.
  @Transactional(Propagation.Mandatory)
  async getForUpdate(ref: PortalRef) {
    const { tx } = this.txHost;
    const key = `${ref.portal}:${ref.externalId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${this.lock}::int, hashtext(${key}))`;
    return this.findByRef(ref);
  }

  // The change, if there is one, and the events it recorded go through the
  // same transaction: they commit or roll back together, so no change is
  // saved without its events.
  @Transactional(Propagation.Mandatory)
  async save(record: A) {
    if (record.dirty) await this.upsert(record.snapshot);
    const events = record.getUncommittedEvents();
    if (events.length)
      await this.outbox.add<CatalogEvent['payload']>(this.txHost.tx, [
        ...events,
      ]);
    record.uncommit();
  }
}
