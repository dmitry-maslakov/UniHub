import { Injectable, Logger } from '@nestjs/common';
import { Timeout } from '@nestjs/schedule';
import { ConnectionDirectory } from './connection-directory.js';
import { ConnectorSchedules, type Schedule } from './connector-schedules.js';
import { PluginCatalog } from './plugin-catalog.js';

// Poll connectors run on their schedules, once per connection. Set on every
// start: a turned-off connector's schedule would keep firing otherwise. The
// scheduler's, once the app is up, so only where the background work runs.
@Injectable()
export class PollSchedule {
  private readonly logger = new Logger(PollSchedule.name);

  constructor(
    private readonly catalog: PluginCatalog,
    private readonly directory: ConnectionDirectory,
    private readonly schedules: ConnectorSchedules,
  ) {}

  // A schedule that isn't set is logged by its connection, and the others
  // are set all the same: nothing else would say a connection isn't polled.
  @Timeout('poll-schedule', 0)
  async apply() {
    const desired = this.desired();
    for (const { connection, pattern } of desired)
      await this.schedules
        .set({ connection, pattern })
        .catch((err: unknown) =>
          this.failed(
            `${connection.key}'s poll schedule "${pattern}" wasn't set`,
            err,
          ),
        );
    await this.schedules
      .keepOnly(desired.map((s) => s.connection))
      .catch((err: unknown) =>
        this.failed("turned-off connectors' schedules weren't removed", err),
      );
  }

  desired(): Schedule[] {
    return this.catalog.pollConnectors.flatMap(({ spec }) =>
      this.directory
        .connections(spec.portal)
        .map((connection) => ({ connection, pattern: spec.schedule })),
    );
  }

  private failed(message: string, err: unknown) {
    this.logger.error(message, (err as Error).stack);
  }
}
