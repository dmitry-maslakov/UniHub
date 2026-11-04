// the only file other modules import from catalog
export * from './application/commands.js';
export * from './application/queries.js';
export type { PortalRef } from './domain/portal-ref.js';
export { AcademicYear, CourseName, Slug } from './domain/values.js';
export {
  FILE_CONTENT_CHANGED,
  FILE_REMOVED,
  ITEM_CHANGED,
  ITEM_REMOVED,
  type CatalogEvent,
} from './domain/events.js';
export {
  CourseSlugTakenError,
  MisplacedFileError,
  UnknownCourseError,
  UnknownReferenceError,
} from './domain/errors.js';
