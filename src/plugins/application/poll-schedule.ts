import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ConnectionDirectory } from './connection-directory.js';
import { ConnectorSchedules, type Schedule } from './connector-schedules.js';
import { PluginCatalog } from './plugin-catalog.js';

// Poll connectors run on their schedules, once per connection. Set on every
// start: a turned-off connector's schedule would keep firing otherwise.
@Injectable()
export class PollSchedule implements OnApplicationBootstrap {
  constructor(
    private readonly catalog: PluginCatalog,
    private readonly directory: ConnectionDirectory,
    private readonly schedules: ConnectorSchedules,
  ) {}

  onApplicationBootstrap() {
    return this.apply();
  }

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
