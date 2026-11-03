// the only file other modules import from catalog
export { UpsertPortalCourseCommand } from './application/commands/upsert-portal-course.command.js';
export {
  UpsertItemCommand,
  type ItemInput,
} from './application/commands/upsert-item.command.js';
export {
  UpsertFileCommand,
  type FileInput,
} from './application/commands/upsert-file.command.js';
export { SetFileContentCommand } from './application/commands/set-file-content.command.js';
export { RemoveItemCommand } from './application/commands/remove-item.command.js';
export { RemoveFileCommand } from './application/commands/remove-file.command.js';
export { GetPortalCourseQuery } from './application/queries/get-portal-course.query.js';
export { GetItemQuery } from './application/queries/get-item.query.js';
export { GetFileQuery } from './application/queries/get-file.query.js';
export { FindFileQuery } from './application/queries/find-file.query.js';
export type {
  FileDto,
  ItemDto,
  PortalCourseDto,
} from './application/queries/dtos.js';
export type { Json } from './domain/changes.js';
export { UnknownReferenceError } from './domain/errors.js';
export type {
  FileContentChanged,
  FileRemoved,
  ItemChanged,
  ItemRemoved,
} from './domain/events.js';
export {
  FILE_CONTENT_CHANGED,
  FILE_REMOVED,
  ITEM_CHANGED,
  ITEM_REMOVED,
} from './topics.js';
