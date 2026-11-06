import { Readable } from 'node:stream';
import { PortalId } from '@app/kernel';
import { InMemoryBlobs } from '../../../test/in-memory-blobs.js';
import { sha256 } from '../../../test/sha256.js';
import * as catalog from '../../catalog/contracts.js';
import { Connection } from '../domain/connection.js';
import { MalformedRecordError, SharedOnlyError } from '../domain/errors.js';
import { ingest } from './ingest.fakes.js';

const portal = PortalId.parse('canvas');
const shared = Connection.shared(portal);
const someone = Connection.of({ portal, account: 'someone' });

const stored = (blobs: InMemoryBlobs) => [...blobs.stored.values()].map(String);

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

  it('takes a date sent as text, and no text or json postgres would refuse', async () => {
    const { service, sent } = ingest();
    const post = { externalId: 'p1', kind: 'post', raw: {} };
    await service.item(shared, { ...post, publishedAt: '2026-10-29T14:12Z' });
    expect((sent[0] as catalog.UpsertItemCommand).data.publishedAt).toEqual(
      new Date('2026-10-29T14:12:00Z'),
    );

    for (const nul of [{ title: 'a\u0000b' }, { raw: { body: 'a\u0000b' } }])
      await expect(
        service.item(shared, { ...post, ...nul }),
      ).rejects.toBeInstanceOf(MalformedRecordError);
    expect(sent).toHaveLength(1);
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
    const slides = '%PDF slides';
    const answer = await service.content(shared, 'f1', Readable.from([slides]));
    const hash = sha256(slides);
    expect(answer).toEqual({ hash, changed: true });
    expect(stored(blobs)).toEqual([slides]);
    expect(sent).toEqual([
      new catalog.SetFileContentCommand({ portal, externalId: 'f1' }, hash),
    ]);
  });

  it("doesn't read content of a file it was never told about", async () => {
    const { service, blobs } = ingest();
    const content = Readable.from(['%PDF slides']);
    await expect(service.content(shared, 'nope', content)).rejects.toThrow(
      catalog.UnknownReferenceError,
    );
    expect(content.destroyed).toBe(true);
    expect(stored(blobs)).toEqual([]);
  });

  it('takes records and removals one by one from the shared account alone', async () => {
    const { service, sent } = ingest();
    const post = { externalId: 'p1', kind: 'post', raw: {} };
    for (const send of [
      () => service.course(someone, { externalId: 'c1', name: 'OS' }),
      () => service.item(someone, post),
      () => service.file(someone, { externalId: 'f1', name: 'f.pdf' }),
      () => service.content(someone, 'f1', Readable.from(['%PDF'])),
      () => service.removeItem(someone, 'p1'),
    ])
      await expect(send()).rejects.toThrow(SharedOnlyError);
    await expect(service.removeFile(shared, '')).rejects.toThrow(
      /^invalid record: externalId: /,
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
    await service.forget(shared);
    expect(await service.state(shared)).toBeNull();
    await expect(service.saveState(shared, new Date())).rejects.toThrow(
      MalformedRecordError,
    );
    await expect(service.saveState(shared, 'a\u0000')).rejects.toThrow(
      'invalid record: state: contains a NUL character',
    );
  });
});
