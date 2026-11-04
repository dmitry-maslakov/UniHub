import type { Connection } from '../../ingest/contracts.js';

// A poll connector runs from this queue: a job scheduler per connection (by
// its key) adds a TICK on the connector's schedule, a TICK adds a POLL
// deduplicated per connection, so a run is skipped while the previous one
// is still going, on whichever instance. (Schedulers can't deduplicate.)
export const CONNECTORS_QUEUE = 'connectors';
export const TICK = 'tick';
export const POLL = 'poll';

export interface ConnectorJob {
  portal: string;
  account: string;
}

export const jobOf = ({ portal, account }: Connection): ConnectorJob => ({
  portal,
  account,
});
