import type { ArgumentsHost } from '@nestjs/common';
import { firstValueFrom, type Observable } from 'rxjs';
import { NotFoundError } from '@app/kernel';
import { McpErrorsFilter } from './mcp-errors.filter.js';

class GoneError extends NotFoundError {}

describe('McpErrorsFilter', () => {
  it('hands the model the message, as a tool error', async () => {
    const host = { getType: () => 'rpc' } as unknown as ArgumentsHost;
    const result = new McpErrorsFilter().catch(
      new GoneError('page not found'),
      host,
    ) as Observable<never>;
    await expect(firstValueFrom(result)).rejects.toEqual({
      status: 'error',
      message: 'page not found',
    });
  });
});
