import type { ContentHash, MediaType } from '@app/kernel';
import type { PluginJob } from './plugin-job.js';

// what processors are matched by
export interface FileFact {
  name: string;
  mime: MediaType | null;
}

// catalog's files, as processing needs them
export abstract class FileFacts {
  // null once it's gone
  abstract file(id: string): Promise<FileFact | null>;
  // the files that hold this content and aren't removed
  abstract holding(hash: ContentHash): Promise<FileFact[]>;
  // every file that has content and isn't removed
  abstract withContent(): AsyncIterable<FileFact & { hash: ContentHash }>;
}

export abstract class PluginJobQueue {
  // Each job under its id, all or none: the same work queued again is
  // dropped for as long as the queue keeps the first, done or failed.
  abstract enqueue(jobs: readonly PluginJob[]): Promise<void>;
  // Dropped only while the same work waits or runs, so a job that finished
  // or failed doesn't keep it from being queued again.
  abstract requeue(job: PluginJob): Promise<void>;
}
