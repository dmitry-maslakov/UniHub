import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';

// The signed-in user's id. The auth guard puts the user on the request (a
// session's or an API key's), so other modules don't need to know how they
// signed in. A route that lets anyone in has none: 401.
export const userIdOf = (request: { user?: { id: string } | null }) => {
  const id = request.user?.id;
  if (!id) throw new UnauthorizedException();
  return id;
};

export const CurrentUserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    userIdOf(ctx.switchToHttp().getRequest()),
);
