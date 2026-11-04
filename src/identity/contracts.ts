// the only file other modules import from identity
export { IdentityModule } from './identity.module.js';
export { GrantCourseAccessCommand } from './application/commands/grant-course-access.command.js';
export { RevokeCourseAccessCommand } from './application/commands/revoke-course-access.command.js';
export {
  ReadableCoursesQuery,
  type ReadableCourses,
} from './application/queries/readable-courses.query.js';
export { UnknownUserError } from './domain/errors.js';
export { ADMIN_ROLE } from './domain/user.js';
export { ApiKeyAuth, Public } from './infrastructure/http/api-key.guard.js';
// for routes only admins may call: @Roles([ADMIN_ROLE])
export { Roles } from '@thallesp/nestjs-better-auth';
export {
  CurrentUserId,
  signedInUserId,
  userIdOf,
} from './infrastructure/http/current-user-id.js';
