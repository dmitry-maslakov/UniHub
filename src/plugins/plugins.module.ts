import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { PluginRegistry } from './plugin-registry.js';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [PluginRegistry],
  exports: [PluginRegistry],
})
export class PluginsModule {}
