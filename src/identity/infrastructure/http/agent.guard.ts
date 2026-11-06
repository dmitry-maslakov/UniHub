import {
  applyDecorators,
  Injectable,
  UnauthorizedException,
  UseFilters,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import { AuthenticateAgent } from '../../application/authenticate-agent.js';
import { agentCredential } from '../../domain/agent-credential.js';
import { McpResource } from '../mcp-settings.js';
import {
  AgentChallengeFilter,
  InsufficientScopeException,
} from './agent-challenge.filter.js';

type AgentRequest = Request & { user?: { id: string } | null };

// Needs an API key (X-API-Key or Authorization: Bearer) or an OAuth access
// token for /api/mcp (Authorization: Bearer or DPoP), and puts its user on
// the request for CurrentUserId / userIdOf. A session doesn't count:
// browsers send cookies on their own, keys and tokens are sent on purpose.
// The api-key plugin's own enableSessionForAPIKeys would do it for keys, but
// its docs advise against it in production, and it lets a banned user's key
// in.
@Injectable()
export class AgentGuard implements CanActivate {
  constructor(
    private readonly authenticate: AuthenticateAgent,
    private readonly resource: McpResource,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AgentRequest>();
    const credential = agentCredential({
      apiKey: req.header('x-api-key'),
      authorization: req.header('authorization'),
      dpop: req.header('dpop'),
      method: req.method,
      // as the client sent it, whatever the proxy: a DPoP proof names it
      url: new URL(req.originalUrl, this.resource.url).href,
    });
    const agent = credential && (await this.authenticate.run(credential));
    if (agent === 'insufficient-scope') throw new InsufficientScopeException();
    if (!agent) throw new UnauthorizedException();
    req.user = { id: agent.userId };
    return true;
  }
}

// A route for MCP clients, by API key or OAuth access token instead of a
// session; refused, it answers with the challenge that starts an OAuth
// sign-in (AgentChallengeFilter). The user carries no roles, so @Roles
// doesn't belong on such a route. What needs the user (a limit per user)
// goes in `then`: applied after the agent's guard, its guards run after it,
// wherever the route's decorators sit. The module that has one imports
// IdentityModule, for what the guard and the filter take.
export const McpAuth = (...then: ReturnType<typeof applyDecorators>[]) =>
  applyDecorators(
    AllowAnonymous(),
    UseGuards(AgentGuard),
    UseFilters(AgentChallengeFilter),
    ...then,
  );
