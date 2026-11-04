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
export { ApiKeyAuth, Public } from './infrastructure/http/api-key.guard.js';
// for routes only admins may call: @Roles([ADMIN_ROLE])
export { Roles } from '@thallesp/nestjs-better-auth';
export {
  CurrentUserId,
  signedInUserId,
  userIdOf,
} from './infrastructure/http/current-user-id.js';
