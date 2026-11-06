import type { ContentHash, PluginName } from '@app/kernel';
import type { TextChunk } from '../domain/chunks.js';
import type { Post } from '../domain/post-text.js';
import {
  refId,
  type RecordKey,
  type RecordManifest,
  type RecordRef,
} from '../domain/records.js';
import { UnpackingRepository, type Unpacking } from '../domain/unpacking.js';
import {
  keyId,
  RepresentationRepository,
  type Representation,
  type RepresentationKey,
} from '../domain/representation.js';
import { Holders } from './holders.js';
import type { PluginJob } from './plugin-job.js';
import {
  FileFacts,
  HtmlText,
  PluginJobQueue,
  PostFacts,
  SearchMetrics,
  TextIndex,
  TextIndexQueue,
  type FileFact,
  type IndexedRecordChunk,
  type SearchOutcome,
  type TextQuery,
  type UnrankedReason,
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
    for (const [id, file] of this.files) yield { ...file, id };
  }
}

// catalog's posts by id; a removed one is left out
export class FakePosts extends PostFacts {
  constructor(readonly saved = new Map<string, Post & { updatedAt: Date }>()) {
    super();
  }

  async post(id: string) {
    return this.saved.get(id) ?? null;
  }

  async *posts() {
    for (const [id, { updatedAt }] of this.saved) yield { id, updatedAt };
  }
}

// HTML read as it is, so a spec's strings are its texts: officeparser's
// reading is OfficeParserHtmlText's spec's
export class PlainHtmlText extends HtmlText {
  readonly read: string[][] = [];

  async textsOf(html: readonly string[]) {
    this.read.push([...html]);
    return [...html];
  }
}

// one tree per content, as saved
export class InMemoryUnpackings extends UnpackingRepository {
  readonly saved = new Map<ContentHash, Unpacking>();

  async current(hash: ContentHash) {
    return this.saved.get(hash) ?? null;
  }

  async save(unpacking: Unpacking) {
    this.saved.set(unpacking.hash, unpacking);
  }

  async *trees() {
    for (const { members: _, cutShort: __, ...made } of this.saved.values())
      yield made;
  }

  async holding(hash: ContentHash) {
    return [...this.saved.values()].flatMap(({ hash: container, members }) =>
      members
        .filter((member) => member.hash === hash)
        .map(({ path, mime }) => ({ container, path, mime })),
    );
  }
}

// the files' holders, and the members of these trees
export const holdersOf = (
  files: FileFacts,
  unpackings: UnpackingRepository = new InMemoryUnpackings(),
) => new Holders(files, unpackings);

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

// What put() and putRecord() wrote, by key and by ref; `calls` says in what
// order it was asked. A search answers `hits` whatever it asks, and is kept
// in `searched`.
export class InMemoryTextIndex extends TextIndex {
  readonly texts = new Map<
    string,
    { key: RepresentationKey; chunks: readonly TextChunk[] }
  >();
  readonly records = new Map<
    string,
    { manifest: RecordManifest; chunks: readonly IndexedRecordChunk[] }
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

  async recordManifest(ref: RecordRef) {
    return this.records.get(refId(ref))?.manifest ?? null;
  }

  async putRecord(
    manifest: RecordManifest,
    chunks: readonly IndexedRecordChunk[],
  ) {
    this.calls.push('putRecord');
    this.records.set(refId(manifest), { manifest, chunks });
  }

  async putRecordFingerprint(key: RecordKey) {
    this.calls.push('putRecordFingerprint');
    const record = this.records.get(refId(key))!;
    this.records.set(refId(key), {
      ...record,
      manifest: { ...record.manifest, fingerprint: key.fingerprint },
    });
  }

  async removeRecord(ref: RecordRef) {
    this.calls.push('removeRecord');
    this.records.delete(refId(ref));
  }

  async *recordKeys() {
    this.calls.push('recordKeys');
    for (const {
      manifest: { digest: _, ...key },
    } of this.records.values())
      yield key as RecordKey;
  }

  async search(query: TextQuery) {
    this.searched.push(query);
    return this.hits;
  }
}

export class FakeTextIndexQueue extends TextIndexQueue {
  readonly enqueued: RepresentationKey[] = [];
  readonly requeued: RepresentationKey[] = [];
  readonly records: { ref: RecordRef; change: string }[] = [];
  readonly requeuedRecords: RecordRef[] = [];

  async enqueue(key: RepresentationKey) {
    this.enqueued.push(key);
  }

  async requeue(key: RepresentationKey) {
    this.requeued.push(key);
  }

  async enqueueRecord(ref: RecordRef, change: string) {
    this.records.push({ ref, change });
  }

  async requeueRecord(ref: RecordRef) {
    this.requeuedRecords.push(ref);
  }
}

// how each search came out and how long it took, and why one kept the
// index's order
export class RecordedSearchMetrics extends SearchMetrics {
  readonly searches: { outcome: SearchOutcome; seconds: number }[] = [];
  readonly unrankedBy: UnrankedReason[] = [];

  searched(outcome: SearchOutcome, seconds: number) {
    this.searches.push({ outcome, seconds });
  }

  unranked(reason: UnrankedReason) {
    this.unrankedBy.push(reason);
  }
}
