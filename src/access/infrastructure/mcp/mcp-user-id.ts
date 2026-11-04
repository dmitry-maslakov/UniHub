import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { McpContext } from '@rekog/mcp-nest';
import { userIdOf } from '../../../identity/contracts.js';

// The user an MCP tool is called for: the one the key guard put on the HTTP
// request the call came with (McpHttpController).
export const McpUserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const request = ctx
      .switchToRpc()
      .getContext<McpContext>()
      .getRawRequest<Parameters<typeof userIdOf>[0]>();
    return userIdOf(request ?? {});
  },
);
