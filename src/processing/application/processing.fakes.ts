import type { ContentHash, PluginName } from '@app/kernel';
import type { PluginCatalog } from '../../plugins/contracts.js';
import type { TextChunk } from '../domain/chunks.js';
import {
  ExpansionRepository,
  type Expansion,
  type ExpansionKey,
} from '../domain/expansion.js';
import {
  keyId,
  RepresentationRepository,
  type Representation,
  type RepresentationKey,
} from '../domain/representation.js';
import { ContentNames } from './content-names.js';
import type { PluginJob } from './plugin-job.js';
import {
  FileFacts,
  PluginJobQueue,
  TextIndex,
  TextIndexQueue,
  TextReads,
  type FileFact,
  type TextQuery,
} from './ports.js';
import type { TextHit } from './queries.js';

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

const sameKey = (a: ExpansionKey, b: ExpansionKey) =>
  a.hash === b.hash && a.expander === b.expander && a.version === b.version;

export class InMemoryExpansions extends ExpansionRepository {
  readonly saved: Expansion[] = [];

  async exists(key: ExpansionKey) {
    return (await this.find(key)) !== null;
  }

  async find(key: ExpansionKey) {
    return this.saved.find((saved) => sameKey(saved, key)) ?? null;
  }

  async newestOf(hashes: readonly ContentHash[]) {
    return this.saved.filter(
      (saved) =>
        hashes.includes(saved.hash) &&
        !this.saved.some(
          (other) =>
            other.hash === saved.hash &&
            other.expander === saved.expander &&
            other.version > saved.version,
        ),
    );
  }

  async naming(hash: ContentHash) {
    return (await this.newestOf(this.saved.map((saved) => saved.hash))).filter(
      ({ entries }) => entries.some((entry) => entry.hash === hash),
    );
  }

  async save(expansion: Expansion) {
    if (!(await this.exists(expansion))) this.saved.push(expansion);
  }
}

// the names of the files' contents, and of the entries of these expansions
export const namesOf = (
  files: FileFacts,
  plugins: PluginCatalog,
  expansions: ExpansionRepository = new InMemoryExpansions(),
) => new ContentNames(files, expansions, plugins);

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

// the newest texts of what these representations saved
export class InMemoryTextReads extends TextReads {
  constructor(readonly representations = new InMemoryRepresentations()) {
    super();
  }

  async newest(hashes: readonly ContentHash[]) {
    const texts = [];
    for await (const key of this.representations.newestKeys())
      if (hashes.includes(key.hash)) {
        const { parts } = (await this.representations.newest(
          key.hash,
          key.processor,
        ))!;
        texts.push({ ...key, pages: parts.length });
      }
    return texts;
  }

  async page(hash: ContentHash, processor: PluginName, page: number) {
    const newest = await this.representations.newest(hash, processor);
    return newest?.parts[page - 1] ?? null;
  }
}

// What put() wrote, by key; `calls` says in what order it was asked. A
// search answers `hits` whatever it asks, and is kept in `searched`.
export class InMemoryTextIndex extends TextIndex {
  readonly texts = new Map<
    string,
    { key: RepresentationKey; chunks: readonly TextChunk[] }
  >();
  readonly calls: string[] = [];
  readonly searched: TextQuery[] = [];
  hits: TextHit[] = [];

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

  async search(query: TextQuery) {
    this.searched.push(query);
    return this.hits;
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
