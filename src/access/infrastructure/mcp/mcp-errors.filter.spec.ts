import type { ArgumentsHost } from '@nestjs/common';
import { firstValueFrom, type Observable } from 'rxjs';
import { NotFoundError, UnavailableError } from '@app/kernel';
import { McpErrorsFilter } from './mcp-errors.filter.js';

class GoneError extends NotFoundError {
  readonly reason = 'GONE';
}
class AwayError extends UnavailableError {
  readonly reason = 'AWAY';
}

describe('McpErrorsFilter', () => {
  it.each([
    new GoneError('page not found'),
    new AwayError('search is unavailable, try again later'),
  ])('hands the model the message, as a tool error', async (error) => {
    const host = { getType: () => 'rpc' } as unknown as ArgumentsHost;
    const result = new McpErrorsFilter().catch(
      error,
      host,
    ) as Observable<never>;
    await expect(firstValueFrom(result)).rejects.toEqual({
      status: 'error',
      message: error.message,
    });
  });
});
