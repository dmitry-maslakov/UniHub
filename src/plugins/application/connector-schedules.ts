import type { Connection } from '../../ingest/contracts.js';

export interface Schedule {
  connection: Connection;
  // cron for the shared account, a user's account's grid (Grid) else
  repeat: { pattern: string } | { every: number; offset: number };
}

// Where polls are queued: on a schedule per connection, or now.
export abstract class ConnectorSchedules {
  // the connection is polled on this schedule, in place of any it had
  abstract set(schedule: Schedule): Promise<void>;
  // the schedules of any other connection are removed
  abstract keepOnly(connections: readonly Connection[]): Promise<void>;
  // the connection's schedule, if it has one
  abstract remove(connection: Connection): Promise<void>;
  // a poll of this connection, unless one is waiting or running already
  abstract pollNow(connection: Connection): Promise<void>;
}
