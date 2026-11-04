import type { INestApplication } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ingestConfig } from '../../ingest.config.js';
import { grpcOptions } from './grpc.options.js';

// gRPC for external connectors, next to HTTP, once some connector has a
// token. It doesn't inherit the HTTP auth guard: connectors sign in with
// their tokens.
export function connectIngest(app: INestApplication) {
  const { tokens, grpcUrl } = app.get<ConfigType<typeof ingestConfig>>(
    ingestConfig.KEY,
  );
  if (tokens.size) app.connectMicroservice(grpcOptions(grpcUrl));
}
