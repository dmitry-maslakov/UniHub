// A poll connector runs from this queue: a job scheduler per connection
// (portal + account, by its key) adds a tick on the connector's schedule, a
// tick adds a poll deduplicated per connection, so a run is skipped while the
// previous one is still going, on whichever instance.
export const CONNECTORS_QUEUE = 'connectors';

export interface ConnectorJob {
  portal: string;
  account: string;
}
