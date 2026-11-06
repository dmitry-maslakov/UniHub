import {
  UnavailableError,
  type ContentHash,
  type MediaType,
  type PluginName,
} from '@app/kernel';
import type { TextChunk } from '../domain/chunks.js';
import type { RepresentationKey } from '../domain/representation.js';
import type { PluginJob } from './plugin-job.js';
import type { TextHit } from './queries.js';

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

// words to look for (NFC, as the chunks are), among these contents only
export interface TextQuery {
  text: string;
  // the words' meaning, by the embedder that made the chunks' vectors;
  // without it, by the words alone
  vector?: number[];
  hashes: readonly ContentHash[];
  // whose texts are looked through: the processors on. One turned off keeps
  // its texts indexed, found again once it's back on
  processors: readonly PluginName[];
  // contents, at most
  size: number;
}

// a chunk as it's indexed: with its vector when there's an embedder
export interface IndexedChunk extends TextChunk {
  vector?: number[];
}

// The processors' texts in the search index. Made of postgres alone, so
// ReconcileIndex can build it again from nothing.
export abstract class TextIndex {
  // creates the index if it's missing; asks the server every time
  abstract ensure(): Promise<void>;
  // writes the chunks, then the manifest, then drops the other versions of
  // (hash, processor), newer ones too
  abstract put(
    key: RepresentationKey,
    chunks: readonly IndexedChunk[],
  ): Promise<void>;
  // every version of what a processor made of this content
  abstract remove(of: {
    hash: ContentHash;
    processor: PluginName;
  }): Promise<void>;
  // the representations indexed in full (those with a manifest)
  abstract keys(): AsyncIterable<RepresentationKey>;
  // the contents whose texts match, best first, as SearchTextsQuery answers
  abstract search(query: TextQuery): Promise<TextHit[]>;
}

// a job per key, which indexes the newest version of its (hash, processor)
export abstract class TextIndexQueue {
  // dropped while the same key waits or runs, and after that for as long as
  // the queue keeps its job
  abstract enqueue(key: RepresentationKey): Promise<void>;
  // dropped only while the same key waits or runs
  abstract requeue(key: RepresentationKey): Promise<void>;
}

// the index can't be reached now: worth waiting out, not the job's fault
export class TextIndexUnavailableError extends UnavailableError {
  readonly reason = 'SEARCH_INDEX_UNAVAILABLE';
}

// An embedding model's server: a vector per text, in their order, all of
// the model's dimensions, cut into as many calls as the server wants. The
// signal stops it partway (indexing, at shutdown).
export abstract class Embedder {
  abstract embed(
    texts: readonly string[],
    signal?: AbortSignal,
  ): Promise<number[][]>;
}

// the same model for queries, on a server of its own: a query never waits
// behind indexing
export abstract class QueryEmbedder extends Embedder {}

// the embedder can't be reached now, or is too busy: as with the index
export class EmbedderUnavailableError extends UnavailableError {
  readonly reason = 'EMBEDDER_UNAVAILABLE';
}

// A model that reads the query and each text together, which scores how
// well a text answers it better than the index does, but slowly: it takes
// only a search's best `candidates`. null: busy with another query.
export abstract class Reranker {
  abstract readonly candidates: number;
  // a score per text, in their order, the higher the better
  abstract scores(
    query: string,
    texts: readonly string[],
  ): Promise<number[] | null>;
}

// the reranker can't be reached now, or is too busy: as with the embedder
export class RerankerUnavailableError extends UnavailableError {
  readonly reason = 'RERANKER_UNAVAILABLE';
}
