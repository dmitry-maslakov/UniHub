import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { ConfiguredInstanceQuery } from '../../catalog/contracts.js';
import { PluginCatalog } from './plugin-catalog.js';

@QueryHandler(ConfiguredInstanceQuery)
export class ConfiguredInstanceHandler implements IQueryHandler<ConfiguredInstanceQuery> {
  constructor(private readonly plugins: PluginCatalog) {}

  execute({ portal }: ConfiguredInstanceQuery) {
    return Promise.resolve(this.plugins.configuredInstance(portal));
  }
}
