import type { Readable } from 'node:stream';
import type { ContentHash } from '@app/kernel';

// file content addressed by its sha256, the same bytes are stored once
// no matter how many files point to them
export abstract class BlobStore {
  abstract put(content: Readable): Promise<{ hash: ContentHash; size: number }>;
  abstract get(hash: ContentHash): Promise<Readable>;
}
