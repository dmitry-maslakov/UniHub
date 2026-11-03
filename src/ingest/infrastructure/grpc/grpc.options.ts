import { join } from 'node:path';
import { Transport, type GrpcOptions } from '@nestjs/microservices';

// external connectors talk to the hub over this; the hub runs it next to http
export const grpcOptions = (url: string): GrpcOptions => ({
  transport: Transport.GRPC,
  options: {
    package: 'unihub.ingest.v1',
    protoPath: join(process.cwd(), 'proto/ingest.proto'),
    url,
    loader: { keepCase: false, longs: Number, defaults: false },
    // Shutdown cuts uploads in progress (Nest's default): a graceful one has no
    // timeout, so one stalled upload would hold up the whole app. A cut upload
    // stores nothing and the connector sends it again.
    // Pings find connections that died without closing (a sleeping laptop).
    channelOptions: {
      'grpc.keepalive_time_ms': 60_000,
      'grpc.keepalive_timeout_ms': 20_000,
    },
  },
});
