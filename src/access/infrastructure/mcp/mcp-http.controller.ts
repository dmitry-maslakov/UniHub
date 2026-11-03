import { Controller, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { McpHttpControllerFor } from '@rekog/mcp-nest';
import { ApiKeyAuth } from '../../../identity/contracts.js';
import { throttleBy } from '../throttle.js';
import { mcpTransport } from './mcp.strategy.js';

// /api/mcp: MCP over streamable HTTP, for API keys. Guards run in the order
// they're added, and the lower decorator adds first: the key, then the limit
// by the key's user.
@Controller('mcp')
@ApiExcludeController()
@UseGuards(throttleBy('mcp'))
@ApiKeyAuth()
export class McpHttpController extends McpHttpControllerFor(mcpTransport) {}
