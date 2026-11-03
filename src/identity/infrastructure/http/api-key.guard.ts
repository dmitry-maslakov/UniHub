import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiKeyUserQuery } from '../../application/queries/api-key-user.query.js';

export interface KeyedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: { id: string } | null;
  // set when the caller came with an API key
  apiKeyId?: string;
}

const header = (req: KeyedRequest, name: string) => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

// For routes that take API keys as well as sessions (MCP). The route must let
// the session guard through (@OptionalAuth()); a signed-in caller passes, any
// other needs a key in X-API-Key or as Authorization: Bearer. The user goes on
// the request like a session's, so CurrentUserId and @Roles work the same.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly queries: QueryBus) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<KeyedRequest>();
    if (req.user) return true;
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
