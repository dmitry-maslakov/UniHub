import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { QueryBus } from '@nestjs/cqrs';
import {
  CredentialRejectedError,
  type ConnectorContext,
  type Credential,
} from '@app/plugin-sdk';
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

// Who a connector runs for, and what it gets for a run: a portal read as
// shared, for the shared account; any other, for each user's own account
// that reads now, on a grid of its own.
@Injectable()
export class ConnectionDirectory {
  constructor(
    private readonly ingest: IngestService,
    private readonly queries: QueryBus,
    @Inject(pluginsConfig.KEY)
    private readonly config: ConfigType<typeof pluginsConfig>,
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
  // credential, and what it finds shows at its slot. Null for an account
  // that no longer reads.
  async context(
    connection: Connection,
    signal: AbortSignal,
    start = new Date(),
  ): Promise<ConnectorContext | null> {
    const { portal, account } = connection;
    const base = { connection: { portal, account }, signal };
    if (connection.shared)
      return {
        ...base,
        account: { kind: 'shared' },
        ingest: new SdkPortalIngest(this.ingest, connection, signal),
      };
    const credentialOf = () =>
      this.queries.execute(new AccountCredentialQuery(account));
    let first: Credential | null = await credentialOf();
    if (!first) return null;
    const slot = slotOf(start, this.gridOf(connection));
    const run: Run = {
      shown: (ended) => publication(slot, ended, this.config.publishing),
    };
    return {
      ...base,
      // asked anew after the first time, so a run that goes on gets its
      // OAuth access token renewed; one no longer there is rejected
      account: {
        kind: 'user',
        credential: async () => {
          const credential = first ?? (await credentialOf());
          first = null;
          if (!credential) throw new CredentialRejectedError();
          return credential;
        },
      },
      ingest: new SdkPortalIngest(this.ingest, connection, signal, run),
    };
  }
}
