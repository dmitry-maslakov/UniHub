import { join } from 'node:path';
import { Transport, type GrpcOptions } from '@nestjs/microservices';

// external connectors talk to the hub over this; the hub runs it next to http
export const grpcOptions = (url: string): GrpcOptions => ({
  transport: Transport.GRPC,
  options: {
    package: 'unihub.ingest',
    protoPath: join(process.cwd(), 'proto/ingest.proto'),
    url,
    loader: { keepCase: false, longs: Number, defaults: false },
  },
});
