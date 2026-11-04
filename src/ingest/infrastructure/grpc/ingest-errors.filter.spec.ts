import type { ArgumentsHost } from '@nestjs/common';
import { status, type Metadata } from '@grpc/grpc-js';
import { GrpcUnauthenticatedException } from '@nestjs/microservices';
import protobuf from 'protobufjs';
import { firstValueFrom, type Observable } from 'rxjs';
import {
  ConflictError,
  InvalidValueError,
  NotFoundError,
  PortalId,
} from '@app/kernel';
import { UnknownReferenceError } from '../../../catalog/contracts.js';
import { IngestErrorsFilter } from './ingest-errors.filter.js';

class GoneError extends NotFoundError {
  readonly reason = 'GONE';
}
class TakenError extends ConflictError {
  readonly reason = 'TAKEN';
}

interface Answer {
  code: number;
  message: string;
  metadata?: Metadata;
}

const host = {
  getArgByIndex: () => ({ cancelled: false }),
} as unknown as ArgumentsHost;
const answerTo = async (error: unknown) => {
  const result = new IngestErrorsFilter().catch(
    error,
    host,
  ) as Observable<never>;
  return firstValueFrom(result).catch((e: Answer) => e);
};

// the trailer as a connector reads it, with Google's own protos
const Status = protobuf
  .loadSync([
    'proto/google/rpc/status.proto',
    'proto/google/rpc/error_details.proto',
  ])
  .lookupType('google.rpc.Status');
const details = ({ metadata }: Answer) =>
  Status.toObject(
    Status.decode(metadata!.get('grpc-status-details-bin')[0] as Buffer),
    { json: true },
  );

describe('IngestErrorsFilter', () => {
  it("answers the hub's kinds of error the way HTTP does", async () => {
    expect((await answerTo(new GoneError('x'))).code).toBe(status.NOT_FOUND);
    expect((await answerTo(new TakenError('x'))).code).toBe(
      status.ALREADY_EXISTS,
    );
    expect(
      (await answerTo(new InvalidValueError('content hash', 'x'))).code,
    ).toBe(status.INVALID_ARGUMENT);
  });

  it('asks for the parent first when a record refers to an unknown one', async () => {
    const answer = await answerTo(
      new UnknownReferenceError(PortalId.parse('moodle'), 'c1'),
    );
    expect(answer.code).toBe(status.FAILED_PRECONDITION);
  });

  it('says which error it is in the standard status details', async () => {
    const answer = await answerTo(new TakenError('course x already exists'));
    expect(details(answer)).toEqual({
      code: status.ALREADY_EXISTS,
      message: 'course x already exists',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'TAKEN',
          domain: 'unihub',
        },
      ],
    });
  });

  it("keeps gRPC's own answers as they are", async () => {
    const answer = await answerTo(new GrpcUnauthenticatedException('who?'));
    expect(answer).toEqual({ code: status.UNAUTHENTICATED, message: 'who?' });
  });
});
