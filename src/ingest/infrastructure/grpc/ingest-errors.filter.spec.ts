import type { ArgumentsHost } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { GrpcUnauthenticatedException } from '@nestjs/microservices';
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
      new UnknownReferenceError(PortalId.parse('acs'), 'c1'),
    );
    expect(answer.code).toBe(status.FAILED_PRECONDITION);
  });

  it("keeps gRPC's own answers as they are", async () => {
    const answer = await answerTo(new GrpcUnauthenticatedException('who?'));
    expect(answer).toEqual({ code: status.UNAUTHENTICATED, message: 'who?' });
  });
});
