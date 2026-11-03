import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';

// The signed-in user's id. The auth guard puts the user on the request (the
// session's now, an API key's in #16), so other modules don't need to know
// how they signed in. A route that lets anyone in has no user: 401.
export const userIdOf = (request: { user?: { id: string } | null }) => {
  if (!request.user) throw new UnauthorizedException();
  return request.user.id;
};

export const CurrentUserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    userIdOf(ctx.switchToHttp().getRequest()),
);
