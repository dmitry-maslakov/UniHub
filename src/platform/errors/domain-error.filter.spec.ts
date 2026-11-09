import { Logger, type ArgumentsHost, type HttpServer } from '@nestjs/common';
import {
  ConflictError,
  InvalidValueError,
  NotFoundError,
  UnavailableError,
  UnprocessableError,
  type DomainError,
} from '@app/kernel';
import { DomainErrorFilter } from './domain-error.filter.js';

class GoneError extends NotFoundError {
  readonly reason = 'GONE';
}
class TakenError extends ConflictError {
  readonly reason = 'TAKEN';
}
class NotThatError extends UnprocessableError {
  readonly reason = 'NOT_THAT';
}
class AwayError extends UnavailableError {
  readonly reason = 'AWAY';
}

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
  // quiet, and read by the test of what gets logged
  const log = vi.spyOn(Logger.prototype, 'error').mockReturnValue();
  beforeEach(() => log.mockClear());

  it('answers each kind as Nest answers its status, with its reason', () => {
    expect(http(new GoneError('course not found'))).toEqual({
      status: 404,
      body: {
        statusCode: 404,
        message: 'course not found',
        error: 'Not Found',
        code: 'GONE',
      },
    });
    expect(http(new TakenError('taken')).status).toBe(409);
    expect(http(new InvalidValueError('course slug', 'A B')).status).toBe(400);
    expect(http(new NotThatError('not a picture'))).toMatchObject({
      status: 422,
      body: { code: 'NOT_THAT' },
    });
    expect(http(new AwayError('try again later'))).toMatchObject({
      status: 503,
      body: { code: 'AWAY' },
    });
  });

  it('logs the kind that means the hub is failing, and no other', () => {
    const away = new AwayError('try again later');
    http(new GoneError('course not found'));
    http(away);
    expect(log.mock.calls).toEqual([[away]]);
  });
});
