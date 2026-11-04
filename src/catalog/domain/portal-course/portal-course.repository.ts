import type { PortalRef } from '../portal-ref.js';
import type { PortalCourse } from './portal-course.js';

export abstract class PortalCourseRepository {
  // locked against other writes of it until the transaction ends; null if
  // the portal never sent it
  abstract getForUpdate(ref: PortalRef): Promise<PortalCourse | null>;
  // for what names it (an item, a file, a link): read, not locked
  abstract findByRef(ref: PortalRef): Promise<PortalCourse | null>;
  abstract save(course: PortalCourse): Promise<void>;
}
