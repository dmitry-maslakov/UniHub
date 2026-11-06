import {
  BadRequestException,
  Injectable,
  UnsupportedMediaTypeException,
  type NestMiddleware,
} from '@nestjs/common';
import { validateOriginHeader } from '@modelcontextprotocol/server';
import type { NextFunction, Request, Response } from 'express';
import { TrustedOrigins } from '../../../identity/contracts.js';

// What /api/mcp takes: one JSON-RPC message, as JSON, from no other site's
// page. The body parser caps JSON, but the transport reads a body of any
// other type itself, whole and without a limit. A batch would count as one
// call against the MCP limit while carrying up to 100, and MCP dropped
// batches (2025-06-18). Middleware, so a request it won't take costs no
// sign-in lookup. Bodies are parsed by then: the auth module parses them in
// its own middleware, and it's global, which Nest runs first.
@Injectable()
export class McpRequestMiddleware implements NestMiddleware {
  constructor(private readonly trusted: TrustedOrigins) {}

  use(req: Request, res: Response, next: NextFunction) {
    // The spec's guard against DNS rebinding: a page whose Origin is
    // another site's gets a 403, as the SDK's validateOriginHeader (and
    // mcp-nest's allowedOrigins) has it, by hostname alone (scheme and port
    // aside), which is what a rebinding page can't fake. None at all
    // passes: the AI apps' backends and desktop clients send none. Not the
    // transport's own option: it's built before the settings are read.
    const origin = validateOriginHeader(
      req.header('origin'),
      this.trusted.hostnames,
    );
    if (!origin.ok) {
      res.status(403).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: origin.message },
        id: null,
      });
      return;
    }
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
