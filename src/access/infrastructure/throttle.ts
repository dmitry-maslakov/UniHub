import {
  applyDecorators,
  Injectable,
  UseGuards,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, type ThrottlerModuleOptions } from '@nestjs/throttler';
import { userIdOf } from '../../identity/contracts.js';
import { mcpRequestOf } from './mcp/mcp-user-id.js';

// calls a minute per user, by limit
const LIMITS = {
  // REST, per signed-in user
  api: 1200,
  // MCP, per user, however many keys they make
  mcp: 600,
  // REST and MCP together, per user: a search costs far more than a read.
  // 20 keep the reranker busy about half a minute on 6 arm cores, but the
  // whole minute at its 20 candidates on amd64 (README, Deploying search):
  // the others' searches meanwhile keep the index's order
  search: 20,
};
type Limit = keyof typeof LIMITS;

const LimitOf = Reflector.createDecorator<Limit>();

// A route counted against one named limit. ThrottlerGuard runs every named
// limit, so each one skips the routes that aren't its own. The count is per
// user, so the guard that finds the user must run first: on REST routes it's
// the global session guard; on MCP, ApiKeyAuth applies this after its own.
export const Limited = (name: Limit) =>
  applyDecorators(LimitOf(name), UseGuards(ThrottlerGuard));

// Throttler's way for a context other than HTTP: an MCP call's request is
// the HTTP one it came in with, whose user ApiKeyAuth has found. No rate
// headers: the response is the MCP transport's to write.
@Injectable()
class McpThrottlerGuard extends ThrottlerGuard {
  protected getRequestResponse(context: ExecutionContext) {
    return { req: mcpRequestOf(context), res: {} };
  }
}

// A tool counted against a named limit, sharing its count with the routes
// that are; over it, the call is a tool error (McpErrorsFilter).
export const LimitedTool = (name: Limit) =>
  applyDecorators(LimitOf(name), UseGuards(McpThrottlerGuard));

// In one instance's memory: there is one.
export const throttlerOptions = (
  reflector: Reflector,
): ThrottlerModuleOptions => ({
  throttlers: Object.entries(LIMITS).map(([name, limit]) => ({
    name,
    limit,
    ttl: 60_000,
    skipIf: (ctx: ExecutionContext) =>
      reflector.getAllAndOverride(LimitOf, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) !== name,
  })),
  // never per address (see CLAUDE.md): a limited route without a user is a
  // 401, not a count by address
  getTracker: (req) => userIdOf(req),
  // one budget per user across all of a limit's routes
  generateKey: (_, tracker, name) => `${name}-${tracker}`,
});
