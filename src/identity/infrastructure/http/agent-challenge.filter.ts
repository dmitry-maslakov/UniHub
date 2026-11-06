import {
  Catch,
  ForbiddenException,
  UnauthorizedException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { createResourceServerChallenge } from '@better-auth/oauth-provider';
import { APIError } from 'better-auth/api';
import { createInsufficientScopeError } from 'better-auth/oauth2';
import type { Response } from 'express';
import { MCP_SCOPES } from '../better-auth.js';
import { McpResource } from '../mcp-settings.js';

// an access token that verifies but lacks a scope MCP takes
export class InsufficientScopeException extends ForbiddenException {}

// How an MCP client learns where to sign in and what to ask for: a 401 with
// WWW-Authenticate: Bearer resource_metadata="…" (RFC 9728), scope="…", and
// a 403 insufficient_scope for a token short of it, as
// @better-auth/oauth-provider builds them; the body a JSON-RPC error with no
// id, as @better-auth/mcp's requireMcpAuth answers. Claude starts signing
// in on a 401 alone, and asks again on a 403 only for insufficient_scope.
@Catch(UnauthorizedException, InsufficientScopeException)
export class AgentChallengeFilter implements ExceptionFilter {
  constructor(private readonly resource: McpResource) {}

  catch(exception: UnauthorizedException, host: ArgumentsHost) {
    const refused =
      exception instanceof InsufficientScopeException
        ? createInsufficientScopeError(MCP_SCOPES)
        : new APIError('UNAUTHORIZED', {
            message: 'an API key or an access token is needed',
          });
    const challenge = createResourceServerChallenge(
      refused,
      this.resource.url,
      { challengeScopes: MCP_SCOPES },
    )!;
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(challenge.statusCode)
      .set(challenge.headers)
      .json({
        jsonrpc: '2.0',
        error: { code: -32000, message: challenge.message },
        id: null,
      });
  }
}
