import { UnavailableError } from '@app/kernel';

// The search index away or stuck, as a search's caller is told: try again
// later. OpenSearch's own message (an address, a node's state) goes only to
// the log, as the cause.
export class SearchUnavailableError extends UnavailableError {
  readonly reason = 'SEARCH_UNAVAILABLE';

  constructor(options?: ErrorOptions) {
    super('search is unavailable, try again later', options);
  }
}

// The hub runs without a search index (no OPENSEARCH_URL): no use trying
// again until it's set up with one.
export class SearchOffError extends UnavailableError {
  readonly reason = 'SEARCH_OFF';

  constructor() {
    super('search is off on this hub');
  }
}
