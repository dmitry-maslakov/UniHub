import type { Readable } from 'node:stream';

export interface StoredContent {
  hash: string;
  size: number;
}

// file content addressed by its sha256, the same bytes are stored once
// no matter how many files point to them
export abstract class BlobStore {
  abstract put(content: Readable): Promise<StoredContent>;
  abstract get(hash: string): Promise<Readable>;
  abstract has(hash: string): Promise<boolean>;
}
