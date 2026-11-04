import { Logger, type ArgumentsHost } from '@nestjs/common';
import { firstValueFrom, type Observable } from 'rxjs';
import { NotFoundError, UnavailableError, type DomainError } from '@app/kernel';
import { McpErrorsFilter } from './mcp-errors.filter.js';

class GoneError extends NotFoundError {
  readonly reason = 'GONE';
}
class AwayError extends UnavailableError {
  readonly reason = 'AWAY';
}

const host = { getType: () => 'rpc' } as unknown as ArgumentsHost;
const answerTo = (error: DomainError) =>
  firstValueFrom(
    new McpErrorsFilter().catch(error, host) as Observable<never>,
  ).catch((e: unknown) => e);

describe('McpErrorsFilter', () => {
  // quiet, and read by the test of what gets logged
  const log = vi.spyOn(Logger.prototype, 'error').mockReturnValue();
  beforeEach(() => log.mockClear());

  it.each([
    new GoneError('page not found'),
    new AwayError('search is unavailable, try again later'),
  ])('hands the model the message, as a tool error', async (error) => {
    expect(await answerTo(error)).toEqual({
      status: 'error',
      message: error.message,
    });
  });

  it('logs the kind that means the hub is failing, and no other', async () => {
    const away = new AwayError('search is unavailable, try again later');
    await answerTo(new GoneError('page not found'));
    await answerTo(away);
    expect(log.mock.calls).toEqual([[away]]);
  });
});
