import { Injectable } from '@nestjs/common';
import type { ConnectorContext } from '@app/plugin-sdk';
import type { PortalId } from '@app/kernel';
import {
  Connection,
  IngestService,
  SdkPortalIngest,
} from '../../ingest/contracts.js';

// Who a connector runs for, and what it gets for a run.
@Injectable()
export class ConnectionDirectory {
  constructor(private readonly ingest: IngestService) {}

  // the one place that knows a portal's accounts; per-user ones come with auth
  connections(portal: PortalId) {
    return [Connection.shared(portal)];
  }

  context(connection: Connection, signal: AbortSignal): ConnectorContext {
    const { portal, account } = connection;
    return {
      connection: { portal, account },
      ingest: new SdkPortalIngest(this.ingest, connection),
      signal,
    };
  }
}
