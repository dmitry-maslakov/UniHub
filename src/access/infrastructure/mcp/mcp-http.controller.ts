import { Controller, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { McpHttpControllerFor } from '@rekog/mcp-nest';
import { ApiKeyAuth } from '../../../identity/contracts.js';
import { throttleBy } from '../throttle.js';
import { McpRequestGuard } from './mcp-request.guard.js';
import { mcpTransport } from './mcp.strategy.js';

// /api/mcp: MCP over streamable HTTP, for API keys. Guards run in the order
// they're added, and the lower decorator adds first: the request's shape
// (no key lookup for a body it won't take), the key, then the limit by the
// key's user.
@Controller('mcp')
@ApiExcludeController()
@UseGuards(throttleBy('mcp'))
@ApiKeyAuth()
@UseGuards(McpRequestGuard)
export class McpHttpController extends McpHttpControllerFor(mcpTransport) {}
