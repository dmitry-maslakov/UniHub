import { join } from 'node:path';
import { Transport, type GrpcOptions } from '@nestjs/microservices';

// external connectors talk to the hub over this; the hub runs it next to http
export const grpcOptions = (url: string): GrpcOptions => ({
  transport: Transport.GRPC,
  options: {
    package: 'unihub.ingest.v1',
    protoPath: join(process.cwd(), 'proto/ingest.proto'),
    url,
    // as `npm run proto:generate` has them, so the generated types are what
    // the handlers get
    loader: { keepCase: false, longs: Number, defaults: false },
    // Shutdown cuts uploads in progress (Nest's default): a graceful one has no
    // timeout, so one stalled upload would hold up the whole app. A cut upload
    // stores nothing and the connector sends it again.
    // Pings find connections that died without closing: a connector's own
    // when it connects directly, caddy's when caddy is in front (caddy then
    // notices a dead connector itself and cancels the call).
    keepalive: { keepaliveTimeMs: 60_000, keepaliveTimeoutMs: 20_000 },
  },
});
