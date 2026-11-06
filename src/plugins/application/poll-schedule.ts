import { Injectable, Logger } from '@nestjs/common';
import { Timeout } from '@nestjs/schedule';
import type { Connection } from '../../ingest/contracts.js';
import { ConnectionDirectory } from './connection-directory.js';
import { ConnectorSchedules, type Schedule } from './connector-schedules.js';
import { PluginCatalog } from './plugin-catalog.js';

// Poll connectors run on their schedules, once per connection: the shared
// account's on the connector's, each user's own account's on its grid. Set
// on every start, as a turned-off connector's schedule would keep firing
// otherwise, by the scheduler once the app is up (so only where the
// background work runs), and again as users link accounts or unlink them.
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
    let desired: Schedule[];
    try {
      desired = await this.desired();
    } catch (err) {
      // none removed either, for want of knowing which are still wanted
      return this.failed("the portals' accounts weren't read", err);
    }
    for (const schedule of desired)
      await this.schedules
        .set(schedule)
        .catch((err: unknown) =>
          this.failed(
            `${schedule.connection.key}'s poll schedule ${JSON.stringify(schedule.repeat)} wasn't set`,
            err,
          ),
        );
    await this.schedules
      .keepOnly(desired.map((s) => s.connection))
      .catch((err: unknown) =>
        this.failed("turned-off connectors' schedules weren't removed", err),
      );
  }

  async desired() {
    const schedules: Schedule[] = [];
    for (const { spec } of this.catalog.pollConnectors)
      for (const connection of await this.directory.connections(spec.portal))
        schedules.push(this.of(connection, spec.schedule));
    return schedules;
  }

  // the connection's schedule, if a connector here polls its portal
  scheduleOf(connection: Connection) {
    const connector = this.catalog.pollConnector(connection.portal);
    return connector && this.of(connection, connector.spec.schedule);
  }

  private of(connection: Connection, pattern: string): Schedule {
    if (connection.shared) return { connection, repeat: { pattern } };
    const { everyMs, offsetMs } = this.directory.gridOf(connection);
    return { connection, repeat: { every: everyMs, offset: offsetMs } };
  }

  private failed(message: string, err: unknown) {
    this.logger.error(message, (err as Error).stack);
  }
}
