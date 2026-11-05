import { Catch, Logger, type ArgumentsHost } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { McpExceptionFilter } from '@rekog/mcp-nest';
import { DomainError } from '@app/kernel';

// A domain error of any kind (a course or file the user can't read, a
// service away for now), or a tool's limit reached (LimitedTool), becomes a
// tool error the model reads, the way mcp-nest's own filter does it. Those
// only: anything else stays an "Internal server error" instead of showing
// its message. The tools name it themselves: global filters reach the MCP
// microservice only through inheritAppConfig, which would also bring Better
// Auth's global guard.
@Catch(DomainError, ThrottlerException)
export class McpErrorsFilter extends McpExceptionFilter {
  private readonly logger = new Logger(McpErrorsFilter.name);

  catch(error: DomainError | ThrottlerException, host: ArgumentsHost) {
    // the hub failing, not the call: mcp-nest logs no tool error
    if (error instanceof DomainError && error.kind === 'unavailable')
      this.logger.error(error);
    return super.catch(error, host);
  }
}
