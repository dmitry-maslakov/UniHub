import type { ArgumentsHost } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { firstValueFrom, type Observable } from 'rxjs';
import { ConflictError, InvalidValueError, NotFoundError } from '@app/kernel';
import { InvalidRecordError } from '@app/plugin-sdk';
import { IngestErrorsFilter } from './ingest-errors.filter.js';

const host = {
  getArgByIndex: () => ({ cancelled: false }),
} as unknown as ArgumentsHost;
const codeOf = async (error: unknown) => {
  const result = new IngestErrorsFilter().catch(
    error,
    host,
  ) as Observable<never>;
  return firstValueFrom(result).catch((e: { code: number }) => e.code);
};

describe('IngestErrorsFilter', () => {
  it("answers the hub's kinds of error the way HTTP does", async () => {
    expect(await codeOf(new (class extends NotFoundError {})('x'))).toBe(
      status.NOT_FOUND,
    );
    expect(await codeOf(new (class extends ConflictError {})('x'))).toBe(
      status.ALREADY_EXISTS,
    );
    expect(await codeOf(new InvalidValueError('content hash', 'x'))).toBe(
      status.INVALID_ARGUMENT,
    );
  });

  it('keeps the sdk errors a connector acts on', async () => {
    expect(await codeOf(new InvalidRecordError(['bad']))).toBe(
      status.INVALID_ARGUMENT,
    );
  });
});
