import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { IngestModule } from '../ingest/contracts.js';
import { roleConfig } from '../platform/role/role.config.js';
import { AccountsChangedHandler } from './application/accounts-changed.handler.js';
import { ConnectionDirectory } from './application/connection-directory.js';
import { ConnectorRuns } from './application/connector-runs.js';
import { ConnectorSchedules } from './application/connector-schedules.js';
import { PluginCatalog } from './application/plugin-catalog.js';
import { PluginDiscovery } from './application/plugin-discovery.js';
import { PollSchedule } from './application/poll-schedule.js';
import { PushConnections } from './application/push-connections.js';
import { SyncConnectionHandler } from './application/sync-connection.handler.js';
import { BullmqConnectorSchedules } from './infrastructure/bullmq-connector-schedules.js';
import { CONNECTORS_QUEUE } from './infrastructure/connectors.queue.js';
import { ConnectorsWorker } from './infrastructure/connectors.worker.js';
import { NestPluginDiscovery } from './infrastructure/nest-plugin-discovery.js';
import { OtelConnectorRuns } from './infrastructure/otel-connector-runs.js';
import { HubReaderModule } from './infrastructure/sdk/hub-reader.module.js';
import { pluginsConfig } from './plugins.config.js';

// Finds the enabled plugins and runs the connectors among them, for the
// shared account or for users' own ones (which the accounts module keeps
// and answers PortalReadersQuery for); processing runs the rest through
// PluginCatalog.
@Module({
  imports: [
    ConfigModule.forFeature(pluginsConfig),
    ConfigModule.forFeature(roleConfig),
    DiscoveryModule,
    IngestModule,
    HubReaderModule,
    BullModule.registerQueue({
      name: CONNECTORS_QUEUE,
      // a failed poll is retried by the next tick
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    }),
  ],
  providers: [
    PluginCatalog,
    { provide: PluginDiscovery, useClass: NestPluginDiscovery },
    ConnectionDirectory,
    PollSchedule,
    PushConnections,
    SyncConnectionHandler,
    AccountsChangedHandler,
    { provide: ConnectorSchedules, useClass: BullmqConnectorSchedules },
    { provide: ConnectorRuns, useClass: OtelConnectorRuns },
    ConnectorsWorker,
  ],
  exports: [PluginCatalog],
})
export class PluginsModule {}
