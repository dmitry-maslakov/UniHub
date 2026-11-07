import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { metadataResponse } from '@better-auth/oauth-provider';
import { oauthProviderResourceClient } from '@better-auth/oauth-provider/resource-client';
import { AllowAnonymous, AuthService } from '@thallesp/nestjs-better-auth';
import { toNodeHandler } from 'better-auth/node';
import type { Request, Response } from 'express';
import { ASKED_SCOPES, type Auth } from '../better-auth.js';
import { McpResource } from '../mcp-settings.js';

// OAuth's discovery documents, where MCP clients look for them: at the
// root, outside the api prefix (app.setup.ts). The authorization server's
// (RFC 8414) for its issuer, /api/auth, by Better Auth's own handler (the
// provider's onRequest), which the auth module only hands /api/auth. And
// /api/mcp's protected resource metadata (RFC 9728), at the path-suffixed
// URL clients try first and at the root, by the provider's resource client:
// mcp()'s own leaves offline_access out of its scopes, which an app that
// asks for what the resource names then never asks for (ASKED_SCOPES).
@Controller('.well-known')
@ApiExcludeController()
@AllowAnonymous()
export class WellKnownController {
  private readonly handle;
  // the plugin's actions themselves: createAuthClient would only wrap them,
  // and none of them makes a request
  private readonly resourceClient;

  constructor(
    private readonly auth: AuthService<Auth>,
    private readonly resource: McpResource,
  ) {
    this.handle = toNodeHandler(auth.instance);
    this.resourceClient = oauthProviderResourceClient(
      auth.instance,
    ).getActions();
  }

  @Get(['oauth-protected-resource', 'oauth-protected-resource/api/mcp'])
  async protectedResource(@Res() res: Response) {
    // the issuer, as access tokens are checked against it
    const { baseURL } = await this.auth.instance.$context;
    const metadata = await this.resourceClient.getProtectedResourceMetadata({
      resource: this.resource.url,
      authorization_servers: [baseURL],
      bearer_methods_supported: ['header'],
      scopes_supported: ASKED_SCOPES,
    });
    // with the provider's own headers for a metadata document
    const answer = metadataResponse(metadata);
    res
      .status(answer.status)
      .set(Object.fromEntries(answer.headers))
      .send(await answer.text());
  }

  @Get('oauth-authorization-server/api/auth')
  serve(@Req() req: Request, @Res() res: Response) {
    return this.handle(req, res);
  }
}
