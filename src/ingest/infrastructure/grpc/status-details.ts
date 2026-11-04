import { Metadata } from '@grpc/grpc-js';
import { getProtoPath, loadSync } from 'google-proto-files';

// google.rpc's own Status and ErrorInfo, from the protos Google publishes
const rpc = loadSync(getProtoPath('rpc', 'status.proto'));
rpc.loadSync(getProtoPath('rpc', 'error_details.proto'));
const Status = rpc.lookupType('google.rpc.Status');

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
