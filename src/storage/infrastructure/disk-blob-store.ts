import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Disk } from 'flydrive';
import { BlobStore } from '../domain/blob-store.js';

const keyOf = (hash: string) => `${hash.slice(0, 2)}/${hash}`;

// works on any flydrive disk: local folder now, s3/r2 later
export class DiskBlobStore extends BlobStore {
  constructor(
    private readonly disk: Disk,
    private readonly tmpDir = tmpdir(),
  ) {
    super();
  }

  // The hash is known only after the whole stream is read, so the content is
  // written to a local temp file first. The disk then gets it under its final
  // key, and only if it isn't there yet (no move, which on s3 is copy + delete).
  async put(content: Readable) {
    const hasher = createHash('sha256');
    let size = 0;
    const tap = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        hasher.update(chunk);
        size += chunk.length;
        done(null, chunk);
      },
    });

    const tmp = join(this.tmpDir, `unihub-${randomUUID()}`);
    try {
      await pipeline(content, tap, createWriteStream(tmp));
      const hash = hasher.digest('hex');
      if (!(await this.disk.exists(keyOf(hash))))
        await this.disk.putStream(keyOf(hash), createReadStream(tmp));
      return { hash, size };
    } finally {
      await rm(tmp, { force: true });
    }
  }

  get(hash: string) {
    return this.disk.getStream(keyOf(hash));
  }

  has(hash: string) {
    return this.disk.exists(keyOf(hash));
  }
}
