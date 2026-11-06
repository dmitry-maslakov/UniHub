import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { ContentHash } from '@app/kernel';
import {
  BlobStore,
  ContentTooLargeError,
} from '../src/storage/domain/blob-store.js';
import { sha256 } from './sha256.js';

// Storage for the unit specs: content kept by its sha256 up to `maxBytes`,
// and every stream it handed out, to see they were closed.
export class InMemoryBlobs extends BlobStore {
  readonly stored = new Map<ContentHash, Buffer>();
  readonly opened: Readable[] = [];
  readonly maxBytes: number;

  constructor({
    maxBytes = 1024,
    holding = [],
  }: { maxBytes?: number; holding?: string[] } = {}) {
    super();
    this.maxBytes = maxBytes;
    for (const content of holding)
      this.stored.set(sha256(content), Buffer.from(content));
  }

  async put(content: Readable, limit = this.maxBytes) {
    const data = await buffer(content);
    const maxBytes = Math.min(limit, this.maxBytes);
    if (data.length > maxBytes) throw new ContentTooLargeError(maxBytes);
    const hash = sha256(data);
    this.stored.set(hash, data);
    return { hash, size: data.length };
  }

  async get(hash: ContentHash) {
    const data = this.stored.get(ContentHash.parse(hash));
    if (!data) throw new Error(`no content ${hash}`);
    const stream = Readable.from([data]);
    this.opened.push(stream);
    return stream;
  }
}
