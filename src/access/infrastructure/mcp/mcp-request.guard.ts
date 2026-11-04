import {
  BadRequestException,
  Injectable,
  UnsupportedMediaTypeException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

// What /api/mcp takes: one JSON-RPC message, as JSON. The body parser caps
// JSON, but the transport reads a body of any other type itself, whole and
// without a limit. A batch would count as one call against the MCP limit
// while carrying up to 100, and MCP dropped batches (2025-06-18).
@Injectable()
export class McpRequestGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (req.method !== 'POST') return true;
    // null: no body at all, which the transport answers itself
    if (req.is('application/json') === false)
      throw new UnsupportedMediaTypeException('MCP messages are JSON');
    if (Array.isArray(req.body))
      throw new BadRequestException('one JSON-RPC message per request');
    return true;
  }
}
