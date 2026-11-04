// the only file other modules import from identity
export { IdentityModule } from './identity.module.js';
export {
  GrantCourseAccessCommand,
  RevokeCourseAccessCommand,
} from './application/commands.js';
export { ReadScopeQuery } from './application/queries.js';
export type { ReadScope } from './domain/read-scope.js';
export { UnknownUserError } from './domain/errors.js';
export { ADMIN_ROLE } from './domain/reader.js';
export { ApiKeyAuth } from './infrastructure/http/api-key.guard.js';
// @AllowAnonymous() for a route anyone may call, signed in or not (health);
// @Roles([ADMIN_ROLE]) for one only admins may
export { AllowAnonymous, Roles } from '@thallesp/nestjs-better-auth';
export {
  CurrentUserId,
  userIdOf,
} from './infrastructure/http/current-user-id.js';
