import type { ContentHash, MediaType } from '@app/kernel';
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
