import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { ConfiguredInstanceQuery } from '../../catalog/contracts.js';
import { InstanceAdoption } from './instance-adoption.js';
import { PluginCatalog } from './plugin-catalog.js';

// The site an admin's link names a portal course of, once the rows from
// before sites were told apart are that site's: the link then names the
// course the hub has, not a new one beside it.
@QueryHandler(ConfiguredInstanceQuery)
export class ConfiguredInstanceHandler implements IQueryHandler<ConfiguredInstanceQuery> {
  constructor(
    private readonly plugins: PluginCatalog,
    private readonly adoption: InstanceAdoption,
  ) {}

  async execute({ portal }: ConfiguredInstanceQuery) {
    if (this.plugins.hasInstances(portal)) await this.adoption.done();
    return this.plugins.configuredInstance(portal);
  }
}
