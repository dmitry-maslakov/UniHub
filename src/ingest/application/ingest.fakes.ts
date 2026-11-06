import type { Outbox } from '@nestjs/outbox';
import type { Json } from '@app/kernel';
import { FakeBus } from '../../../test/fake-bus.js';
import { InMemoryBlobs } from '../../../test/in-memory-blobs.js';
import * as catalog from '../../catalog/contracts.js';
import type { Connection } from '../domain/connection.js';
import { FetchLeases } from '../domain/fetch-leases.js';
import { SyncStateRepository } from '../domain/sync-state.js';
import { IngestService } from './ingest.service.js';

// IngestService for the unit specs, on fakes of its ports.

export class FakeStates extends SyncStateRepository {
  private readonly byKey = new Map<string, Json>();

  async get({ key }: Connection) {
    return this.byKey.get(key) ?? null;
  }

  async save({ key }: Connection, state: Json) {
    this.byKey.set(key, state);
  }

  async remove({ key }: Connection) {
    this.byKey.delete(key);
  }
}

// a lease for the first to ask for a key
export class FakeLeases extends FetchLeases {
  readonly taken = new Set<string>();

  async take(key: string) {
    if (this.taken.has(key)) return false;
    this.taken.add(key);
    return true;
  }
}

// Catalog answers every command with `changed`, and knows the files `known`
// names; the hub has the bytes of the files `had` names
export function ingest({
  changed = true,
  known = ['f1'],
  had = [] as string[],
} = {}) {
  const commands = new FakeBus([
    [Object, () => ({ id: 'id', changed, needsContent: true })],
  ]);
  const queries = new FakeBus([
    [
      catalog.FindFileQuery,
      ({ file }: catalog.FindFileQuery) =>
        known.includes(file.externalId) ? { id: 'id' } : null,
    ],
    [
      catalog.HasBytesQuery,
      ({ file }: catalog.HasBytesQuery) => had.includes(file.externalId),
    ],
  ]);
  // storage keeps up to 100 bytes of a file
  const blobs = new InMemoryBlobs({ maxBytes: 100 });
  const outbox = { notify: vi.fn() };
  const leases = new FakeLeases();
  const service = new IngestService(
    commands.commands,
    queries.queries,
    blobs,
    new FakeStates(),
    outbox as unknown as Outbox,
    leases,
  );
  return {
    service,
    sent: commands.sent,
    asked: queries.sent,
    blobs,
    outbox,
    leases,
  };
}
