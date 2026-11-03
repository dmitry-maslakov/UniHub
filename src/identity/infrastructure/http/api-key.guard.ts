import {
  applyDecorators,
  Injectable,
  UnauthorizedException,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ApiKeyUserQuery } from '../../application/queries/api-key-user.query.js';

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
// count: browsers send cookies on their own, keys are sent on purpose.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly queries: QueryBus) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<KeyedRequest>();
    const key =
      header(req, 'x-api-key') ??
      header(req, 'authorization')?.replace(/^Bearer\s+/i, '');
    const found = key && (await this.queries.execute(new ApiKeyUserQuery(key)));
    if (!found) throw new UnauthorizedException();
    req.user = { id: found.userId };
    req.apiKeyId = found.keyId;
    return true;
  }
}

// A route anyone may call, signed in or not (health)
export const Public = () => AllowAnonymous();

// A route for API keys instead of sessions (MCP). The user carries no roles,
// so @Roles doesn't belong on such a route.
export const ApiKeyAuth = () =>
  applyDecorators(AllowAnonymous(), UseGuards(ApiKeyGuard));
