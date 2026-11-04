import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import type { ContentHash } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import { ContentTooLargeError } from '../domain/blob-store.js';
import { FsBlobStore } from './fs-blob-store.js';

describe('FsBlobStore', () => {
  let root: string;
  let store: FsBlobStore;
  // 4 MB, so writes take more than one chunk
  const content = Buffer.alloc(4 * 1024 * 1024, 'slides ');
  const hash = sha256(content);
  const blobPath = () => join(root, hash.slice(0, 2), hash);

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'blobs-'));
    // content right at the limit is kept
    store = new FsBlobStore({ location: root, maxBytes: content.length });
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it('stores content once under its sha256', async () => {
    const first = await store.put(Readable.from([content]));
    const second = await store.put(Readable.from([content]));

    expect(first).toEqual({ hash, size: content.length });
    expect(second).toEqual(first);
    expect(await readdir(join(root, hash.slice(0, 2)))).toEqual([hash]);
    expect(await readdir(join(root, 'tmp'))).toEqual([]);
    expect(sha256(await buffer(await store.get(hash)))).toBe(hash);
  });

  it('never exposes a half-written blob to a concurrent put', async () => {
    const results = await Promise.all([
      store.put(Readable.from([content])),
      store.put(Readable.from([content])),
      store.put(Readable.from([content])),
    ]);

    expect(new Set(results.map((r) => r.hash))).toEqual(new Set([hash]));
    expect((await stat(blobPath())).size).toBe(content.length);
  });

  it('replaces a truncated blob left from an earlier failure', async () => {
    await mkdir(join(root, hash.slice(0, 2)), { recursive: true });
    await writeFile(blobPath(), content.subarray(0, 65_536));

    await store.put(Readable.from([content]));

    expect(sha256(await buffer(await store.get(hash)))).toBe(hash);
  });

  it('leaves nothing behind when the stream fails', async () => {
    const broken = new Readable({
      read() {
        this.destroy(new Error('connection reset'));
      },
    });

    await expect(store.put(broken)).rejects.toThrow('connection reset');
    expect(await readdir(root)).toEqual(['tmp']);
    expect(await readdir(join(root, 'tmp'))).toEqual([]);
  });

  it('refuses content past its limit and keeps none of it', async () => {
    const endless = Readable.from(
      (function* () {
        for (;;) yield content.subarray(0, 65_536);
      })(),
    );

    await expect(store.put(endless)).rejects.toThrow(ContentTooLargeError);
    expect(await readdir(root)).toEqual(['tmp']);
    expect(await readdir(join(root, 'tmp'))).toEqual([]);
  });

  it('removes only old temp files when it starts', async () => {
    // the first start: no temp folder yet
    await store.onModuleInit();
    await mkdir(join(root, 'tmp'), { recursive: true });
    await writeFile(join(root, 'tmp', 'in-flight'), 'x');
    await writeFile(join(root, 'tmp', 'stale'), 'x');
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await utimes(join(root, 'tmp', 'stale'), twoDaysAgo, twoDaysAgo);

    await store.onModuleInit();

    expect(await readdir(join(root, 'tmp'))).toEqual(['in-flight']);
  });

  it('refuses anything that is not a sha256 as a hash', async () => {
    // a value that skipped ContentHash.parse
    const path = '../../etc/passwd' as ContentHash;
    await expect(store.get(path)).rejects.toThrow('not a sha256 in hex');
  });
});
