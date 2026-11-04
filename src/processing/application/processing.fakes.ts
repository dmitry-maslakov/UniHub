import type { ContentHash } from '@app/kernel';
import {
  RepresentationRepository,
  type Representation,
  type RepresentationKey,
} from '../domain/representation.js';
import type { PluginJob } from './plugin-job.js';
import { FileFacts, PluginJobQueue, type FileFact } from './ports.js';

// In-memory ports for the application's unit tests; plugins come from
// test/discovered-plugins.ts, content from test/in-memory-blobs.ts.

// catalog's files by id; a removed one is left out
export class FakeFiles extends FileFacts {
  constructor(
    readonly files = new Map<string, FileFact & { hash: ContentHash }>(),
  ) {
    super();
  }

  async file(id: string) {
    return this.files.get(id) ?? null;
  }

  async holding(hash: ContentHash) {
    return [...this.files.values()].filter((file) => file.hash === hash);
  }

  async *withContent() {
    yield* this.files.values();
  }
}

export class FakeQueue extends PluginJobQueue {
  readonly enqueued: PluginJob[] = [];
  readonly requeued: PluginJob[] = [];

  async enqueue(jobs: readonly PluginJob[]) {
    this.enqueued.push(...jobs);
  }

  async requeue(job: PluginJob) {
    this.requeued.push(job);
  }
}

const same = (a: RepresentationKey, b: RepresentationKey) =>
  a.hash === b.hash && a.processor === b.processor && a.version === b.version;

export class InMemoryRepresentations extends RepresentationRepository {
  readonly saved: Representation[] = [];

  async exists(key: RepresentationKey) {
    return this.saved.some((saved) => same(saved, key));
  }

  async save(representation: Representation) {
    this.saved.push(representation);
  }
}
