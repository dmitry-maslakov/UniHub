import type { ArgumentsHost, HttpServer } from '@nestjs/common';
import {
  ConflictError,
  InvalidValueError,
  NotFoundError,
  type DomainError,
} from '@app/kernel';
import { DomainErrorFilter } from './domain-error.filter.js';

class GoneError extends NotFoundError {}
class TakenError extends ConflictError {}

function http(error: DomainError) {
  const replies: { body: unknown; status: number }[] = [];
  const adapter = {
    isHeadersSent: () => false,
    reply: (_: unknown, body: unknown, status: number) =>
      void replies.push({ body, status }),
  } as unknown as HttpServer;
  const host = {
    getType: () => 'http',
    getArgByIndex: () => ({}),
  } as unknown as ArgumentsHost;
  new DomainErrorFilter(adapter).catch(error, host);
  return replies[0];
}

describe('DomainErrorFilter', () => {
  it('answers each kind as Nest answers its status', () => {
    expect(http(new GoneError('course not found'))).toEqual({
      status: 404,
      body: {
        statusCode: 404,
        message: 'course not found',
        error: 'Not Found',
      },
    });
    expect(http(new TakenError('taken')).status).toBe(409);
    expect(http(new InvalidValueError('course slug', 'A B')).status).toBe(400);
  });
});
