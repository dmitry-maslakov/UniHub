import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { Outbox } from '@nestjs/outbox';
import { ContentHash, PortalId, type Json } from '@app/kernel';
import * as catalog from '../../catalog/contracts.js';
import { BlobStore } from '../../storage/contracts.js';
import { Connection } from '../domain/connection.js';
import {
  MalformedRecordError,
  RemovalNotAllowedError,
} from '../domain/errors.js';
import { SyncStateRepository } from '../domain/sync-state.js';
import { IngestService } from './ingest.service.js';

const portal = PortalId.parse('canvas');
const shared = Connection.shared(portal);
const someone = Connection.of({ portal, account: 'someone' });
const sha256 = (data: string) =>
  createHash('sha256').update(data).digest('hex');

// storage that keeps what it was given, up to 100 bytes
class FakeBlobs extends BlobStore {
  readonly maxBytes = 100;
  readonly stored: string[] = [];

  async put(content: Readable) {
    const data = (await buffer(content)).toString();
    this.stored.push(data);
    return { hash: ContentHash.parse(sha256(data)), size: data.length };
  }

  get(): Promise<Readable> {
    throw new Error('not read here');
  }
}

class FakeStates extends SyncStateRepository {
  private readonly byKey = new Map<string, Json>();

  async get({ key }: Connection) {
    return this.byKey.get(key) ?? null;
  }

  async save({ key }: Connection, state: Json) {
    this.byKey.set(key, state);
  }
}

// catalog answers every command with `changed`, and knows the files `known` names
function ingest({ changed = true, known = ['f1'] } = {}) {
  const sent: object[] = [];
  const commands = {
    execute: async (command: object) => {
      sent.push(command);
      return { id: 'id', changed, needsContent: true };
    },
  };
  const queries = {
    execute: async ({ file }: catalog.FindFileQuery) =>
      known.includes(file.externalId) ? { id: 'id' } : null,
  };
  const blobs = new FakeBlobs();
  const outbox = { notify: vi.fn() };
  const service = new IngestService(
    commands as unknown as CommandBus,
    queries as unknown as QueryBus,
    blobs,
    new FakeStates(),
    outbox as unknown as Outbox,
  );
  return { service, sent, blobs, outbox };
}

describe('IngestService', () => {
  it("hands catalog a record as the connection's portal, nothing it may not set", async () => {
    const { service, sent } = ingest();
    await service.course(shared, {
      externalId: 'c1',
      name: 'OS',
      portal: 'someone-else',
      id: 'chosen',
    });
    expect(sent).toEqual([
      new catalog.UpsertPortalCourseCommand({
        portal,
        externalId: 'c1',
        name: 'OS',
        url: null,
        meta: null,
      }),
    ]);
  });

  it('names what a record is missing, and sends nothing', async () => {
    const { service, sent } = ingest();
    const error = await service
      .item(shared, { externalId: 'p1' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MalformedRecordError);
    expect((error as MalformedRecordError).issues).toEqual([
      expect.stringMatching(/^kind: /),
      expect.stringMatching(/^raw: /),
    ]);
    expect(sent).toEqual([]);
  });

  it('wakes the outbox relay only when something changed', async () => {
    const item = { externalId: 'p1', kind: 'post', raw: {} };
    const changed = ingest();
    await changed.service.item(shared, item);
    expect(changed.outbox.notify).toHaveBeenCalledOnce();

    const same = ingest({ changed: false });
    expect(await same.service.item(shared, item)).toEqual({ changed: false });
    expect(same.outbox.notify).not.toHaveBeenCalled();
  });

  it("takes a file's media type by its essence, and no content past the limit", async () => {
    const { service, sent } = ingest();
    const answer = await service.file(shared, {
      externalId: 'f1',
      name: 'video.mp4',
      mime: 'Video/MP4; codecs=avc1',
      size: 101,
      updatedAt: '2026-11-01T10:00:00Z',
    });
    expect(answer).toEqual({ changed: true, needsContent: false });
    expect((sent[0] as catalog.UpsertFileCommand).data).toMatchObject({
      mime: 'video/mp4',
      path: '',
      sourceUpdatedAt: new Date('2026-11-01T10:00:00Z'),
    });
  });

  it('stores content of a file catalog knows, and tells catalog its hash', async () => {
    const { service, sent, blobs } = ingest();
    const answer = await service.content(shared, 'f1', Readable.from(['v1']));
    const hash = ContentHash.parse(sha256('v1'));
    expect(answer).toEqual({ hash, changed: true });
    expect(blobs.stored).toEqual(['v1']);
    expect(sent).toEqual([
      new catalog.SetFileContentCommand({ portal, externalId: 'f1' }, hash),
    ]);
  });

  it("doesn't read content of a file it was never told about", async () => {
    const { service, blobs } = ingest();
    const content = Readable.from(['v1']);
    await expect(service.content(shared, 'nope', content)).rejects.toThrow(
      catalog.UnknownReferenceError,
    );
    expect(content.destroyed).toBe(true);
    expect(blobs.stored).toEqual([]);
  });

  it('removes records only for the shared account', async () => {
    const { service, sent } = ingest();
    await expect(service.removeItem(someone, 'p1')).rejects.toThrow(
      RemovalNotAllowedError,
    );
    await expect(service.removeFile(shared, '')).rejects.toThrow(
      MalformedRecordError,
    );
    expect(sent).toEqual([]);

    expect(await service.removeFile(shared, 'f1')).toMatchObject({
      changed: true,
    });
    expect(sent).toEqual([
      new catalog.RemoveFileCommand({ portal, externalId: 'f1' }),
    ]);
  });

  it('keeps state per connection, json only', async () => {
    const { service } = ingest();
    await service.saveState(shared, { cursor: 5, cut: '\ud800' });
    expect(await service.state(shared)).toEqual({ cursor: 5, cut: '�' });
    expect(await service.state(someone)).toBeNull();
    await expect(service.saveState(shared, new Date())).rejects.toThrow(
      MalformedRecordError,
    );
  });
});
