import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { HubReader } from '@app/plugin-sdk';
import { IngestModule } from '../ingest/contracts.js';
import { ConnectorRunner } from './connector-runner.js';
import { CoreHubReader } from './core-hub-reader.js';
import { PluginRegistry } from './plugin-registry.js';

// global because plugins inject HubReader and can't import hub modules
@Global()
@Module({
  imports: [DiscoveryModule, IngestModule],
  providers: [
    PluginRegistry,
    ConnectorRunner,
    { provide: HubReader, useClass: CoreHubReader },
  ],
  exports: [PluginRegistry, HubReader],
})
export class PluginsModule {}
