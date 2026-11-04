import type { Readable } from 'node:stream';
import { InvalidError, type ContentHash } from '@app/kernel';

// more than storage keeps of one file; an endless upload would fill the disk
export class ContentTooLargeError extends InvalidError {
  constructor(maxBytes: number) {
    super(`content is larger than ${maxBytes} bytes`);
  }
}

// File content addressed by its sha256, the same bytes are stored once no
// matter how many files point to them. put() rejects with
// ContentTooLargeError past the configured limit, and keeps nothing then.
export abstract class BlobStore {
  abstract put(content: Readable): Promise<{ hash: ContentHash; size: number }>;
  abstract get(hash: ContentHash): Promise<Readable>;
}
