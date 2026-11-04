import type { ContentHash, MediaType, PluginName } from '@app/kernel';
import type { TextChunk } from '../domain/chunks.js';
import type { RepresentationKey } from '../domain/representation.js';
import type { PluginJob } from './plugin-job.js';

// what processors are matched by
export interface FileFact {
  name: string;
  mime: MediaType | null;
}

// catalog's files, as processing needs them
export abstract class FileFacts {
  // with the content it holds now; null once it's removed
  abstract file(
    id: string,
  ): Promise<(FileFact & { hash: ContentHash | null }) | null>;
  // the files that hold this content and aren't removed
  abstract holding(hash: ContentHash): Promise<FileFact[]>;
  // every file that has content and isn't removed
  abstract withContent(): AsyncIterable<FileFact & { hash: ContentHash }>;
}

export abstract class PluginJobQueue {
  // Each job under its id: the same work queued again is dropped while it
  // waits or runs, and after that for as long as the queue keeps the job,
  // done or failed. So a batch that went in only in part, queued again,
  // adds what's missing.
  abstract enqueue(jobs: readonly PluginJob[]): Promise<void>;
  // Dropped only while the same work waits or runs, so a job that finished
  // or failed doesn't keep it from being queued again.
  abstract requeue(job: PluginJob): Promise<void>;
}

// The processors' texts in the search index. Made of postgres alone, so
// ReconcileIndex can build it again from nothing.
export abstract class TextIndex {
  // creates the index if it's missing; asks the server every time
  abstract ensure(): Promise<void>;
  // writes the chunks, then the manifest, then drops the older versions of
  // (hash, processor)
  abstract put(
    key: RepresentationKey,
    chunks: readonly TextChunk[],
  ): Promise<void>;
  // every version of what a processor made of this content
  abstract remove(of: {
    hash: ContentHash;
    processor: PluginName;
  }): Promise<void>;
  // the representations indexed in full (those with a manifest)
  abstract keys(): AsyncIterable<RepresentationKey>;
}

// a job per key, which indexes the newest version of its (hash, processor)
export abstract class TextIndexQueue {
  // under the key's id, as PluginJobQueue.enqueue
  abstract enqueue(key: RepresentationKey): Promise<void>;
  // dropped only while the same key waits or runs, as PluginJobQueue.requeue
  abstract requeue(key: RepresentationKey): Promise<void>;
}

// the index can't be reached now: worth waiting out, not the job's fault
export class TextIndexUnavailableError extends Error {}
