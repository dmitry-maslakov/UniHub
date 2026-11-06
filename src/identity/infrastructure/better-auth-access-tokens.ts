import type { AddressInfo } from 'node:net';
import { Injectable } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { isAPIError } from 'better-auth/api';
import {
  createDpopReplayStore,
  isInsufficientScopeError,
  verifyAccessTokenRequest,
} from 'better-auth/oauth2';
import { AccessTokens } from '../domain/access-tokens.js';
import type { TokenRequest } from '../domain/agent-credential.js';
import { MCP_SCOPES, type Auth } from './better-auth.js';
import { McpResource } from './mcp-settings.js';

// Checked as @better-auth/mcp's requireMcpAuth checks them, which wraps a
// fetch handler rather than fitting a guard: signed by the hub's keys, by its
// issuer (/api/auth), for /api/mcp alone, not expired, naming the client
// (azp) and the user (sub: no token is a client's own), with the scope MCP
// takes, and a DPoP-bound one with its proof, whose replays the database
// keeps.
@Injectable()
export class BetterAuthAccessTokens extends AccessTokens {
  constructor(
    private readonly auth: AuthService<Auth>,
    private readonly http: HttpAdapterHost,
    private readonly resource: McpResource,
  ) {
    super();
  }

  async verify(request: TokenRequest) {
    const { baseURL, internalAdapter } = await this.auth.instance.$context;
    try {
      const { sub } = await verifyAccessTokenRequest(
        {
          authorizationHeader: request.authorization,
          dpopProofJwt: request.dpop,
          method: request.method,
          url: request.url,
        },
        {
          verifyOptions: {
            issuer: baseURL,
            audience: this.resource.url,
            requiredClaims: ['azp', 'sub'],
          },
          jwksUrl: this.jwksUrl(baseURL),
          requiredScopes: MCP_SCOPES,
          dpop: { replayStore: createDpopReplayStore(internalAdapter) },
        },
      );
      return { userId: String(sub) };
    } catch (error) {
      if (isInsufficientScopeError(error)) return 'insufficient-scope';
      // what the token is refused for; a key set it can't fetch is the
      // hub failing, not the token
      if (isAPIError(error) && error.status === 'UNAUTHORIZED') return null;
      throw error;
    }
  }

  // The hub's own keys, from its own server over loopback: through
  // BETTER_AUTH_URL the call would leave and come back in through the
  // proxy. Kept 5 minutes, fetched again for a key not among them.
  private jwksUrl(baseURL: string) {
    const { port } = this.http.httpAdapter
      .getHttpServer()
      .address() as AddressInfo;
    return `http://127.0.0.1:${port}${new URL(baseURL).pathname}/jwks`;
  }
}
