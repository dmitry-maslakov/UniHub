import {
  applyDecorators,
  Injectable,
  UnauthorizedException,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { AuthenticateApiKey } from '../../application/authenticate-api-key.js';

export interface KeyedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: { id: string } | null;
  apiKeyId?: string;
}

const header = (req: KeyedRequest, name: string) => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

// Needs an API key in X-API-Key or as Authorization: Bearer, and puts the
// key's user on the request for CurrentUserId / userIdOf. A session doesn't
// count: browsers send cookies on their own, keys are sent on purpose. The
// plugin's own enableSessionForAPIKeys would do this, but its docs advise
// against it in production, and it lets a banned user's key in.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly authenticate: AuthenticateApiKey) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<KeyedRequest>();
    const key =
      header(req, 'x-api-key') ??
      header(req, 'authorization')?.replace(/^Bearer\s+/i, '');
    const found = key && (await this.authenticate.run(key));
    if (!found) throw new UnauthorizedException();
    req.user = { id: found.userId };
    req.apiKeyId = found.keyId;
    return true;
  }
}

// A route for API keys instead of sessions (MCP). The user carries no roles,
// so @Roles doesn't belong on such a route. What needs the key's user (a limit
// per user) goes in `then`: applied after the key's guard, its guards run
// after it, wherever the route's decorators sit. The module that has one
// imports IdentityModule, for the guard's AuthenticateApiKey.
export const ApiKeyAuth = (...then: ReturnType<typeof applyDecorators>[]) =>
  applyDecorators(AllowAnonymous(), UseGuards(ApiKeyGuard), ...then);
