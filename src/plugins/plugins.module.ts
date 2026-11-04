import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { IngestModule } from '../ingest/contracts.js';
import { PluginCatalog } from './application/plugin-catalog.js';
import { PluginDiscovery } from './application/plugin-discovery.js';
import { ConnectorHost } from './connector-host.js';
import { ConnectorsWorker } from './connectors.worker.js';
import { CONNECTORS_QUEUE } from './connectors.queue.js';
import { NestPluginDiscovery } from './infrastructure/nest-plugin-discovery.js';
import { HubReaderModule } from './infrastructure/sdk/hub-reader.module.js';
import { pluginsConfig } from './plugins.config.js';

// Finds the enabled plugins and runs the connectors among them; processing
// runs the rest through PluginCatalog.
@Module({
  imports: [
    ConfigModule.forFeature(pluginsConfig),
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
    ConnectorHost,
    ConnectorsWorker,
  ],
  exports: [PluginCatalog, ConnectorHost],
})
export class PluginsModule {}
