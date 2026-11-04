import { Catch } from '@nestjs/common';
import { McpExceptionFilter } from '@rekog/mcp-nest';
import { DomainError } from '@app/kernel';

// A domain error of any kind (a course or file the user can't read, a
// service away for now) becomes a tool error the model reads, the way
// mcp-nest's own filter does it. Domain errors only: anything else stays an
// "Internal server error" instead of showing its message. The tools name it
// themselves: global filters reach the MCP microservice only through
// inheritAppConfig, which would also bring Better Auth's global guard.
@Catch(DomainError)
export class McpErrorsFilter extends McpExceptionFilter {}
