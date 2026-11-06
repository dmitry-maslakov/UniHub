import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { isFresh } from '../../domain/fresh-session.js';

// what the auth guard puts on the request: Better Auth's session
interface SessionRequest {
  session?: { session: { createdAt: Date | string } } | null;
}

// Needs a session signed in within the last day, as Better Auth's own
// routes for what outlasts a session do (API keys, approving a screen): an
// older one is a 403 with the same code theirs answer. After the auth guard,
// which every route has unless it lets anyone in; an API key is no session.
@Injectable()
export class FreshSessionGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const { session } = ctx.switchToHttp().getRequest<SessionRequest>();
    if (!session) throw new UnauthorizedException();
    if (!isFresh(new Date(session.session.createdAt)))
      throw new ForbiddenException({
        statusCode: 403,
        code: 'SESSION_NOT_FRESH',
        message: 'sign in again: this needs a session signed in within a day',
      });
    return true;
  }
}

// a route for a session signed in within the last day
export const FreshSession = () => UseGuards(FreshSessionGuard);
