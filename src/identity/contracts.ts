// the only file other modules import from identity
export { IdentityModule } from './identity.module.js';
export { GrantCourseAccessCommand } from './application/commands/grant-course-access.command.js';
export { RevokeCourseAccessCommand } from './application/commands/revoke-course-access.command.js';
export {
  ReadableCoursesQuery,
  type ReadableCourses,
} from './application/queries/readable-courses.query.js';
export { UnknownUserError } from './domain/errors.js';
export {
  CurrentUserId,
  userIdOf,
} from './infrastructure/http/current-user-id.js';
