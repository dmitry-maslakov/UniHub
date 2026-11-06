import type { INestApplicationContext } from '@nestjs/common';
import { SHARED_ACCOUNT } from '@app/kernel';
import {
  Connection,
  IngestService,
  SdkPortalIngest,
} from '../src/ingest/contracts.js';

// what a connector of this portal gets as ctx.ingest, in a run never stopped
export const portalIngest = (
  app: INestApplicationContext,
  portal: string,
  account = SHARED_ACCOUNT,
) =>
  new SdkPortalIngest(
    app.get(IngestService),
    Connection.of({ portal, account }),
    new AbortController().signal,
  );
