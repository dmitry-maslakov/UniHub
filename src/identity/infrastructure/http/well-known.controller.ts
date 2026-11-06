import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AllowAnonymous, AuthService } from '@thallesp/nestjs-better-auth';
import { toNodeHandler } from 'better-auth/node';
import type { Request, Response } from 'express';
import type { Auth } from '../better-auth.js';

// OAuth's discovery documents, where MCP clients look for them: at the
// root, outside the api prefix (app.setup.ts). /api/mcp's protected
// resource metadata (RFC 9728), at the path-suffixed URL clients try first
// and at the root, and the authorization server's (RFC 8414) for its issuer,
// /api/auth. Better Auth's own handler answers all three (mcp()'s and the
// provider's onRequest), but the auth module only hands it /api/auth.
@Controller('.well-known')
@ApiExcludeController()
@AllowAnonymous()
export class WellKnownController {
  private readonly handle;

  constructor(auth: AuthService<Auth>) {
    this.handle = toNodeHandler(auth.instance);
  }

  @Get([
    'oauth-protected-resource',
    'oauth-protected-resource/api/mcp',
    'oauth-authorization-server/api/auth',
  ])
  serve(@Req() req: Request, @Res() res: Response) {
    return this.handle(req, res);
  }
}
