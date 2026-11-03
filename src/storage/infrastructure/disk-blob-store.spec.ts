import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { Disk } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';
import { DiskBlobStore } from './disk-blob-store.js';

describe('DiskBlobStore', () => {
  let dir: string;
  let tmp: string;
  let store: DiskBlobStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'blobs-'));
    tmp = await mkdtemp(join(tmpdir(), 'blobs-tmp-'));
    store = new DiskBlobStore(
      new Disk(new FSDriver({ location: dir, visibility: 'private' })),
      tmp,
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(tmp, { recursive: true, force: true });
  });

  it('stores content under its sha256, once', async () => {
    const content = 'lecture 5 slides';
    const hash = createHash('sha256').update(content).digest('hex');

    const first = await store.put(Readable.from([content]));
    const second = await store.put(Readable.from([content]));

    expect(first).toEqual({ hash, size: content.length });
    expect(second).toEqual(first);
    expect(await readdir(dir, { recursive: true })).toEqual([
      hash.slice(0, 2),
      `${hash.slice(0, 2)}/${hash}`,
    ]);
    expect(await readdir(tmp)).toEqual([]);
    expect(await store.has(hash)).toBe(true);
    expect(await text(await store.get(hash))).toBe(content);
  });

  it('leaves nothing behind when the stream fails', async () => {
    const broken = new Readable({
      read() {
        this.destroy(new Error('connection reset'));
      },
    });

    await expect(store.put(broken)).rejects.toThrow('connection reset');
    expect(await readdir(tmp)).toEqual([]);
    expect(await readdir(dir)).toEqual([]);
  });
});
