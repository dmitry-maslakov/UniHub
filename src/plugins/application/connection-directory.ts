import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { QueryBus } from '@nestjs/cqrs';
import type { ConnectorContext } from '@app/plugin-sdk';
import type { PortalId } from '@app/kernel';
import { publication } from '../../catalog/contracts.js';
import {
  Connection,
  IngestService,
  SdkPortalIngest,
  type Run,
} from '../../ingest/contracts.js';
import { gridOf, slotOf } from '../domain/grid.js';
import { pluginsConfig } from '../plugins.config.js';
import { AccountCredentialQuery, PortalReadersQuery } from './accounts.js';
import { InstanceAdoption } from './instance-adoption.js';
import { PluginCatalog } from './plugin-catalog.js';

// Who a connector runs for, and what it gets for a run: a portal read as
// shared, for the shared account; any other, for each user's own account
// that reads now, on a grid of its own. A run reads the portal at a site:
// the shared account at the one the portal's settings name, a user's at
// the one it was linked with.
@Injectable()
export class ConnectionDirectory {
  constructor(
    private readonly ingest: IngestService,
    private readonly queries: QueryBus,
    @Inject(pluginsConfig.KEY)
    private readonly config: ConfigType<typeof pluginsConfig>,
    private readonly plugins: PluginCatalog,
    private readonly adoption: InstanceAdoption,
  ) {}

  async connections(portal: PortalId) {
    const readers = await this.queries.execute(new PortalReadersQuery(portal));
    return readers.shared
      ? [Connection.shared(portal)]
      : readers.accounts.map((account) => Connection.of({ portal, account }));
  }

  gridOf({ account }: Connection) {
    return gridOf(account, this.config.publishing.slotMs);
  }

  // What a run that started at `start` gets: a user's account's, its
  // credential, and what it finds shows at its slot; and which seal of the
  // credential that is, to say which one the portal refused (none for the
  // shared account's, the owner's to replace). Null for an account that no
  // longer reads. For a portal of sites, not before the rows from before
  // sites were told apart have theirs (InstanceAdoption); the other
  // portals' runs don't wait on it.
  async context(
    connection: Connection,
    signal: AbortSignal,
    start = new Date(),
  ): Promise<{ context: ConnectorContext; seal: string | null } | null> {
    const { portal, account } = connection;
    if (this.plugins.hasInstances(portal)) await this.adoption.done();
    const base = { connection: { portal, account }, signal };
    if (connection.shared) {
      const shared = connection.at(this.plugins.configuredInstance(portal));
      return {
        context: {
          ...base,
          account: { kind: 'shared' },
          ingest: new SdkPortalIngest(this.ingest, shared, signal),
        },
        seal: null,
      };
    }
    const found = await this.queries.execute(
      new AccountCredentialQuery(account),
    );
    if (!found) return null;
    const { credential, seal, instance } = found;
    const slot = slotOf(start, this.gridOf(connection));
    const run: Run = {
      shown: (ended) => publication(slot, ended, this.config.publishing),
      leaseMs: this.config.pollTimeoutMs,
    };
    return {
      context: {
        ...base,
        account: { kind: 'user', credential: async () => credential },
        ingest: new SdkPortalIngest(
          this.ingest,
          connection.at(instance),
          signal,
          run,
        ),
      },
      seal,
    };
  }
}
