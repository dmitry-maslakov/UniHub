import {
  applyDecorators,
  UseGuards,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, type ThrottlerModuleOptions } from '@nestjs/throttler';
import { userIdOf } from '../../identity/contracts.js';

// calls a minute per user, by limit
const LIMITS = {
  // REST, per signed-in user
  api: 1200,
  // MCP, per user, however many keys they make
  mcp: 600,
};
type Limit = keyof typeof LIMITS;

const LimitOf = Reflector.createDecorator<Limit>();

// A route counted against one named limit. ThrottlerGuard runs every named
// limit, so each one skips the routes that aren't its own. The count is per
// user, so the guard that finds the user must run first: on REST routes it's
// the global session guard; on MCP, ApiKeyAuth applies this after its own.
export const Limited = (name: Limit) =>
  applyDecorators(LimitOf(name), UseGuards(ThrottlerGuard));

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
