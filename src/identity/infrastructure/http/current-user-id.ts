import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

// The signed-in user's id. The auth guard puts the user on the request (the
// session's now, an API key's in #16), so other modules don't need to know
// how they signed in.
export const CurrentUserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<{ user: { id: string } }>().user.id,
);
