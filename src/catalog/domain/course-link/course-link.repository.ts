import type { CourseLink } from './course-link.js';

export abstract class CourseLinkRepository {
  // replaces the portal course's link, if it had one
  abstract save(link: CourseLink): Promise<void>;
  // false if the portal course wasn't linked
  abstract remove(portalCourseId: string): Promise<boolean>;
}
