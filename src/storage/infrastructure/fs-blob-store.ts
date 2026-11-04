import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ContentHash } from '@app/kernel';
import { BlobStore } from '../domain/blob-store.js';
import { storageConfig } from '../storage.config.js';

const DAY = 24 * 60 * 60 * 1000;

// makes the rename itself durable
async function syncDir(path: string) {
  const dir = await open(path, 'r');
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
}

async function sizeOf(path: string) {
  try {
    return (await stat(path)).size;
  } catch {
    return -1;
  }
}

// Content in a local folder under ab/abcdef... A write goes to a temp file in
// the same folder tree and is renamed into place, so a blob is either
// complete or not there; a crash leaves only a temp file behind.
@Injectable()
export class FsBlobStore extends BlobStore implements OnModuleInit {
  private readonly root: string;
  private readonly tmp: string;

  constructor(
    @Inject(storageConfig.KEY) { location }: ConfigType<typeof storageConfig>,
  ) {
    super();
    this.root = location;
    this.tmp = join(location, 'tmp');
  }

  // Temp files of writes that never finished. Only old ones: another instance
  // sharing the folder may be writing right now.
  async onModuleInit() {
    const names = await readdir(this.tmp).catch(() => []);
    const cutoff = Date.now() - DAY;
    for (const name of names) {
      const path = join(this.tmp, name);
      const { mtimeMs } = await stat(path).catch(() => ({
        mtimeMs: Infinity,
      }));
      if (mtimeMs < cutoff) await rm(path, { force: true });
    }
  }

  private pathOf(value: ContentHash) {
    // a path is made of it: checked again, whatever cast the value went
    // through on its way here
    const hash = ContentHash.parse(value);
    return join(this.root, hash.slice(0, 2), hash);
  }

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

    await mkdir(this.tmp, { recursive: true });
    const tmp = join(this.tmp, randomUUID());
    try {
      // flush: fsync before close, so a power cut can't leave garbage under a hash
      await pipeline(content, tap, createWriteStream(tmp, { flush: true }));
      const hash = ContentHash.parse(hasher.digest('hex'));
      const target = this.pathOf(hash);
      // a blob of the wrong size is left over from something that went wrong
      if ((await sizeOf(target)) !== size) {
        await mkdir(dirname(target), { recursive: true });
        await rename(tmp, target);
        await syncDir(dirname(target));
      }
      return { hash, size };
    } finally {
      await rm(tmp, { force: true });
    }
  }

  async get(hash: ContentHash) {
    const path = this.pathOf(hash);
    // fail here rather than on the first read
    await stat(path);
    return createReadStream(path);
  }
}
