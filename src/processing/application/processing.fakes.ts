import type { ContentHash, PluginName } from '@app/kernel';
import type { TextChunk } from '../domain/chunks.js';
import {
  keyId,
  RepresentationRepository,
  type Representation,
  type RepresentationKey,
} from '../domain/representation.js';
import type { PluginJob } from './plugin-job.js';
import {
  FileFacts,
  PluginJobQueue,
  TextIndex,
  TextIndexQueue,
  type FileFact,
} from './ports.js';

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

const of = (
  { hash, processor }: { hash: ContentHash; processor: PluginName },
  key: RepresentationKey,
) => key.hash === hash && key.processor === processor;

export class InMemoryRepresentations extends RepresentationRepository {
  readonly saved: Representation[] = [];

  async exists(key: RepresentationKey) {
    return this.saved.some((saved) => keyId(saved) === keyId(key));
  }

  async newest(hash: ContentHash, processor: PluginName) {
    return (
      this.saved
        .filter((saved) => of({ hash, processor }, saved))
        .toSorted((a, b) => b.version - a.version)[0] ?? null
    );
  }

  async *newestKeys() {
    const newest = new Map<string, RepresentationKey>();
    for (const { hash, processor, version } of this.saved) {
      const at = `${hash}:${processor}`;
      if ((newest.get(at)?.version ?? -1) < version)
        newest.set(at, { hash, processor, version });
    }
    yield* newest.values();
  }

  async save(representation: Representation) {
    this.saved.push(representation);
  }
}

// what put() wrote, by key; `calls` says in what order it was asked
export class InMemoryTextIndex extends TextIndex {
  readonly texts = new Map<
    string,
    { key: RepresentationKey; chunks: readonly TextChunk[] }
  >();
  readonly calls: string[] = [];

  async ensure() {
    this.calls.push('ensure');
  }

  async put(key: RepresentationKey, chunks: readonly TextChunk[]) {
    this.calls.push('put');
    for (const [id, text] of this.texts)
      if (of(key, text.key) && text.key.version !== key.version)
        this.texts.delete(id);
    this.texts.set(keyId(key), { key, chunks });
  }

  async remove(what: { hash: ContentHash; processor: PluginName }) {
    this.calls.push('remove');
    for (const [id, text] of this.texts)
      if (of(what, text.key)) this.texts.delete(id);
  }

  async *keys() {
    this.calls.push('keys');
    for (const { key } of this.texts.values()) yield key;
  }
}

export class FakeTextIndexQueue extends TextIndexQueue {
  readonly enqueued: RepresentationKey[] = [];
  readonly requeued: RepresentationKey[] = [];

  async enqueue(key: RepresentationKey) {
    this.enqueued.push(key);
  }

  async requeue(key: RepresentationKey) {
    this.requeued.push(key);
  }
}
