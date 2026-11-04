import type { ArgumentsHost, HttpServer } from '@nestjs/common';
import { firstValueFrom, type Observable } from 'rxjs';
import {
  ConflictError,
  InvalidValueError,
  NotFoundError,
  type DomainError,
} from '@app/kernel';
import { DomainErrorFilter } from './domain-error.filter.js';

class GoneError extends NotFoundError {}
class TakenError extends ConflictError {}

const host = (type: 'http' | 'rpc') =>
  ({
    getType: () => type,
    getArgByIndex: () => ({}),
  }) as unknown as ArgumentsHost;

function http(error: DomainError) {
  const replies: { body: unknown; status: number }[] = [];
  const adapter = {
    isHeadersSent: () => false,
    reply: (_: unknown, body: unknown, status: number) =>
      void replies.push({ body, status }),
  } as unknown as HttpServer;
  new DomainErrorFilter(adapter).catch(error, host('http'));
  return replies[0];
}

describe('DomainErrorFilter', () => {
  it('answers each kind with its status over HTTP', () => {
    expect(http(new GoneError('course not found'))).toEqual({
      status: 404,
      body: { statusCode: 404, message: 'course not found' },
    });
    expect(http(new TakenError('taken')).status).toBe(409);
    expect(http(new InvalidValueError('course slug', 'A B')).status).toBe(400);
  });

  it('hands MCP the message, for a tool error the model reads', async () => {
    const result = new DomainErrorFilter().catch(
      new GoneError('page not found'),
      host('rpc'),
    ) as Observable<never>;
    await expect(firstValueFrom(result)).rejects.toEqual({
      status: 'error',
      message: 'page not found',
    });
  });
});
