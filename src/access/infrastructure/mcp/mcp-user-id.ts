import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { McpContext } from '@rekog/mcp-nest';
import { userIdOf } from '../../../identity/contracts.js';

// the HTTP request an MCP call came with (McpHttpController)
export const mcpRequestOf = (ctx: ExecutionContext) =>
  ctx
    .switchToRpc()
    .getContext<McpContext>()
    .getRawRequest<Parameters<typeof userIdOf>[0]>() ?? {};

// The user an MCP tool is called for: the one McpAuth's guard put on the HTTP
// request the call came with.
export const McpUserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => userIdOf(mcpRequestOf(ctx)),
);
