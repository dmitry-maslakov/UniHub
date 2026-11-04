import type { Connection } from '../../ingest/contracts.js';

export interface Schedule {
  connection: Connection;
  // cron
  pattern: string;
}

// Where polls are queued: on a schedule per connection, or now.
export abstract class ConnectorSchedules {
  // the schedules become these, any other one removed
  abstract replace(schedules: readonly Schedule[]): Promise<void>;
  // a poll of this connection, unless one is waiting or running already
  abstract pollNow(connection: Connection): Promise<void>;
}
