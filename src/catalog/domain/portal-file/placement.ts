import { MisplacedFileError } from '../errors.js';
import type { Item } from '../item/item.js';
import type { PortalCourse } from '../portal-course/portal-course.js';

// where a file shows up: its portal course, and the post it came with
export interface Placement {
  portalCourseId: string | null;
  itemId: string | null;
}

// A file names its course, the post it came with, or both. Attached to a
// post, it belongs to the post's course: a record that names another course
// as well contradicts itself, and is refused rather than guessed at.
export function placeFile(
  course: Pick<PortalCourse, 'id' | 'ref'> | null,
  item: Pick<Item, 'id' | 'ref' | 'portalCourseId'> | null,
): Placement {
  if (!item) return { portalCourseId: course?.id ?? null, itemId: null };
  if (course && course.id !== item.portalCourseId)
    throw new MisplacedFileError(course.ref, item.ref);
  return { portalCourseId: item.portalCourseId, itemId: item.id };
}
