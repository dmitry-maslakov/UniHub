import { join } from 'node:path';
import { Metadata } from '@grpc/grpc-js';
import protobuf from 'protobufjs';

// google.rpc's own Status and ErrorInfo, the protos as Google publishes them;
// protobufjs has the google/protobuf ones they import
const Status = protobuf
  .loadSync(
    ['status.proto', 'error_details.proto'].map((file) =>
      join(process.cwd(), 'proto/google/rpc', file),
    ),
  )
  .lookupType('google.rpc.Status');

// gRPC's rich error model: the status once more in the
// grpc-status-details-bin trailer, with an ErrorInfo whose reason a client
// can switch on. gRPC libraries read it themselves (Go's status.Details(),
// Java's StatusProto.fromThrowable(), Python's rpc_status.from_call()).
export function statusDetails(code: number, message: string, reason: string) {
  const status = Status.fromObject({
    code,
    message,
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
        reason,
        domain: 'unihub',
      },
    ],
  });
  const metadata = new Metadata();
  metadata.set(
    'grpc-status-details-bin',
    Buffer.from(Status.encode(status).finish()),
  );
  return metadata;
}
