import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';

// The signed-in user's id, if anyone signed in. The auth guard puts the
// user on the request (a session's or an API key's), so other modules don't
// need to know how they signed in.
export const signedInUserId = (request: { user?: { id: string } | null }) =>
  request.user?.id;

// the same where a user is required: a route that lets anyone in has none, 401
export const userIdOf = (request: { user?: { id: string } | null }) => {
  const id = signedInUserId(request);
  if (!id) throw new UnauthorizedException();
  return id;
};

export const CurrentUserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    userIdOf(ctx.switchToHttp().getRequest()),
);
