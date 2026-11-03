import { Controller, Injectable, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';
import { McpHttpControllerFor } from '@rekog/mcp-nest';
import { ApiKeyAuth } from '../../../identity/contracts.js';
import { mcpTransport } from './mcp.strategy.js';

// a ThrottlerGuard for one of the named limits in AppModule
const throttleBy = (name: string) => {
  @Injectable()
  class Only extends ThrottlerGuard {
    protected handleRequest(request: ThrottlerRequest) {
      return request.throttler.name === name
        ? super.handleRequest(request)
        : Promise.resolve(true);
    }
  }
  return Only;
};

// /api/mcp: MCP over streamable HTTP, for API keys. Guards run in the order
// they're added, and the lower decorator adds first: the limit by address,
// the key, then the limit by the key's user.
@Controller('mcp')
@ApiExcludeController()
@UseGuards(throttleBy('mcp'))
@ApiKeyAuth()
@UseGuards(throttleBy('mcp-ip'))
export class McpHttpController extends McpHttpControllerFor(mcpTransport) {}
