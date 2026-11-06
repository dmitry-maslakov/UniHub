import type { Readable } from 'node:stream';
import { InvalidError, type ContentHash } from '@app/kernel';

// more than storage keeps of one file; an endless upload would fill the disk
export class ContentTooLargeError extends InvalidError {
  readonly reason = 'CONTENT_TOO_LARGE';

  constructor(maxBytes: number) {
    super(`content is larger than ${maxBytes} bytes`);
  }
}

// File content addressed by its sha256, the same bytes are stored once no
// matter how many files point to them. put() rejects with
// ContentTooLargeError past maxBytes, or past the limit it's given when
// that's less (what a caller's budget leaves), and keeps nothing then.
export abstract class BlobStore {
  // public, so nobody is asked for content that would only be refused
  abstract readonly maxBytes: number;
  abstract put(
    content: Readable,
    maxBytes?: number,
  ): Promise<{ hash: ContentHash; size: number }>;
  abstract get(hash: ContentHash): Promise<Readable>;
}
