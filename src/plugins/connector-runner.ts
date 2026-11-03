import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { HubIngest } from '../ingest/contracts.js';
import { PluginRegistry } from './plugin-registry.js';

// gives every connector an ingest bound to its own portal, so it can't write
// as another one
@Injectable()
export class ConnectorRunner implements OnApplicationBootstrap {
  constructor(
    private readonly registry: PluginRegistry,
    private readonly ingest: HubIngest,
  ) {}

  async onApplicationBootstrap() {
    for (const { options, instance } of this.registry.connectors) {
      const account = 'shared';
      await instance.start({
        account,
        ingest: this.ingest.forPortal(options.portal, account),
      });
    }
  }
}
