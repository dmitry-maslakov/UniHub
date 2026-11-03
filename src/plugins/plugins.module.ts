import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { PluginRegistry } from './plugin-registry.js';

@Module({
  imports: [DiscoveryModule],
  providers: [PluginRegistry],
  exports: [PluginRegistry],
})
export class PluginsModule {}
