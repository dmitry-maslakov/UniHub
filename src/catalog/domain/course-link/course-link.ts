import type { Course } from '../course/course.js';
import type { PortalCourse } from '../portal-course/portal-course.js';
import type { AcademicYear } from '../values.js';

// Which course a portal course is part of. Its identity is the portal
// course's, so a portal course belongs to one course at most: linking it
// again moves it. Canvas makes a new course every year, hence the year.
export class CourseLink {
  private constructor(
    readonly portalCourseId: string,
    readonly courseId: string,
    // null when the portal course spans years (ACS)
    readonly year: AcademicYear | null,
  ) {}

  static of(
    portalCourse: Pick<PortalCourse, 'id'>,
    course: Pick<Course, 'id'>,
    year: AcademicYear | null,
  ) {
    return new CourseLink(portalCourse.id, course.id, year);
  }
}
