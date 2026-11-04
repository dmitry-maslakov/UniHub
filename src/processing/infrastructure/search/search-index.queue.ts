import type { RepresentationKey } from '../../domain/representation.js';

// Texts go into the search index from this queue, a job per key, each
// indexing the newest version of its (hash, processor).
export const SEARCH_INDEX_QUEUE = 'search-index';
export const INDEX = 'index';

export interface IndexJob {
  key: RepresentationKey;
}
