import { Injectable } from '@nestjs/common';
import { Timeout } from '@nestjs/schedule';
import { ConnectionDirectory } from './connection-directory.js';
import { ConnectorSchedules, type Schedule } from './connector-schedules.js';
import { PluginCatalog } from './plugin-catalog.js';

// Poll connectors run on their schedules, once per connection. Set on every
// start: a turned-off connector's schedule would keep firing otherwise. The
// scheduler's, once the app is up, so only where the background work runs.
@Injectable()
export class PollSchedule {
  constructor(
    private readonly catalog: PluginCatalog,
    private readonly directory: ConnectionDirectory,
    private readonly schedules: ConnectorSchedules,
  ) {}

  @Timeout(0)
  apply() {
    return this.schedules.replace(this.desired());
  }

  desired(): Schedule[] {
    return this.catalog.pollConnectors.flatMap(({ spec }) =>
      this.directory
        .connections(spec.portal)
        .map((connection) => ({ connection, pattern: spec.schedule })),
    );
  }
}
