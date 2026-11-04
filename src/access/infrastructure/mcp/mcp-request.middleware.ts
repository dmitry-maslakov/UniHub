import {
  BadRequestException,
  Injectable,
  UnsupportedMediaTypeException,
  type NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

// What /api/mcp takes: one JSON-RPC message, as JSON. The body parser caps
// JSON, but the transport reads a body of any other type itself, whole and
// without a limit. A batch would count as one call against the MCP limit
// while carrying up to 100, and MCP dropped batches (2025-06-18).
// Middleware, so a body it won't take costs no sign-in lookup. Bodies are
// parsed by then: the auth module parses them in its own middleware, and
// it's global, which Nest runs first.
@Injectable()
export class McpRequestMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    if (req.method === 'POST') {
      // null: no body at all, which the transport answers itself
      if (req.is('application/json') === false)
        throw new UnsupportedMediaTypeException('MCP messages are JSON');
      if (Array.isArray(req.body))
        throw new BadRequestException('one JSON-RPC message per request');
    }
    next();
  }
}
