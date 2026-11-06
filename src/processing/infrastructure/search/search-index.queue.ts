import type { RecordRef } from '../../domain/records.js';
import type { RepresentationKey } from '../../domain/representation.js';

// Texts go into the search index from this queue, a job per key, each
// indexing the newest version of its (hash, processor); and records, a job
// per change, each indexing the record as it is then.
export const SEARCH_INDEX_QUEUE = 'search-index';
export const INDEX = 'index';

export type IndexJob = { key: RepresentationKey } | { record: RecordRef };
