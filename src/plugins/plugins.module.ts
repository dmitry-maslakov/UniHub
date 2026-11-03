import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { HubReader } from '@app/plugin-sdk';
import { IngestModule } from '../ingest/contracts.js';
import { ConnectorHost } from './connector-host.js';
import { ConnectorsWorker } from './connectors.worker.js';
import { CONNECTORS_QUEUE } from './connectors.queue.js';
import { CoreHubReader } from './core-hub-reader.js';
import { PluginRegistry } from './plugin-registry.js';

// global because plugins inject HubReader and can't import hub modules
@Global()
@Module({
  imports: [
    DiscoveryModule,
    IngestModule,
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
    PluginRegistry,
    ConnectorHost,
    ConnectorsWorker,
    { provide: HubReader, useClass: CoreHubReader },
  ],
  exports: [PluginRegistry, HubReader, ConnectorHost],
})
export class PluginsModule {}
