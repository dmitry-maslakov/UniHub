import { Controller } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { McpHttpControllerFor } from '@rekog/mcp-nest';
import { ApiKeyAuth } from '../../../identity/contracts.js';
import { Limited } from '../throttle.js';
import { mcpTransport } from './mcp.strategy.js';

// /api/mcp: MCP over streamable HTTP, for API keys, limited per key's user.
// What the request may carry is McpRequestMiddleware's.
@Controller('mcp')
@ApiExcludeController()
@ApiKeyAuth(Limited('mcp'))
export class McpHttpController extends McpHttpControllerFor(mcpTransport) {}
