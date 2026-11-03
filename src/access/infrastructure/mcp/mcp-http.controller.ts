import { Controller, Injectable, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { McpHttpControllerFor } from '@rekog/mcp-nest';
import { OptionalAuth } from '@thallesp/nestjs-better-auth';
import { ApiKeyGuard } from '../../../identity/contracts.js';
import { mcpTransport } from './mcp.strategy.js';

// limits count per key, or per user for a session
@Injectable()
class PerCallerThrottler extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>) {
    return Promise.resolve(req.apiKeyId ?? req.user?.id ?? req.ip);
  }
}

// /api/mcp: MCP over streamable HTTP, for a signed-in user or an API key
@Controller('mcp')
@ApiExcludeController()
@OptionalAuth()
@UseGuards(ApiKeyGuard, PerCallerThrottler)
export class McpHttpController extends McpHttpControllerFor(mcpTransport) {}
