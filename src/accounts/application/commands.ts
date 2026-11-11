import { Command } from '@nestjs/cqrs';
import type { CatalogCourse } from './hidden-courses.js';

// What access asks for a course the user reads, as they see it
// (HiddenCourses): whose the portal courses are isn't checked here.

// these portal courses hidden for the user
export class HideCoursesCommand extends Command<void> {
  constructor(
    public readonly userId: string,
    public readonly portalCourseIds: readonly string[],
  ) {
    super();
  }
}

// these shown again, and those of public portals' catalogs picked: shown
// among the user's courses for the first time
export class ShowCoursesCommand extends Command<void> {
  constructor(
    public readonly userId: string,
    public readonly portalCourseIds: readonly string[],
    public readonly pick: readonly CatalogCourse[] = [],
  ) {
    super();
  }
}
