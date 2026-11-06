import type { PortalRef } from '../portal-ref.js';
import type { PortalCourse } from './portal-course.js';

export abstract class PortalCourseRepository {
  // locked against other writes of it until the transaction ends; null if
  // the portal never sent it
  abstract getForUpdate(ref: PortalRef): Promise<PortalCourse | null>;
  // for what names it (an item, a file, a link): read, not locked
  abstract findByRef(ref: PortalRef): Promise<PortalCourse | null>;
  abstract save(course: PortalCourse): Promise<void>;
  // the id the hub knows the portal course by, whether or not any account
  // sent it; null if nothing named it yet
  abstract recordId(ref: PortalRef): Promise<string | null>;
  // the same, the record made now if there's none (an admin's link names a
  // portal course whether the hub has it or not); in a transaction, locked
  // as getForUpdate locks
  abstract keep(ref: PortalRef): Promise<string>;
}
