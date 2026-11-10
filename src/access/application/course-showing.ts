import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  HideCoursesCommand,
  ShowCoursesCommand,
} from '../../accounts/contracts.js';
import type { CourseSlug } from '../../catalog/contracts.js';
import { isTheirs } from './grouping.js';
import { readableCourse } from './readable.js';

// A course hidden from the user's courses and shown among them again
// (README, Hidden courses), by its slug as the user sees it: every portal
// course in it is, which accounts keeps. Hiding is a convenience, never
// access: the course is read as before by every route, search and MCP.
@Injectable()
export class CourseShowing {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  // one hidden already, or a public portal's the user didn't pick, stays
  // as it is
  async hide(userId: string, slug: CourseSlug) {
    const { course, portalCourseIds } = await this.course(userId, slug);
    if (course.hidden) return;
    await this.commands.execute(
      new HideCoursesCommand(userId, portalCourseIds),
    );
  }

  // A course with nothing of the user's in it, only public portals'
  // courses they didn't pick, is shown by picking those.
  async show(userId: string, slug: CourseSlug) {
    const { course, portalCourseIds, showing } = await this.course(
      userId,
      slug,
    );
    const theirs = course.portalCourses.some((pc) => isTheirs(pc, showing));
    await this.commands.execute(
      new ShowCoursesCommand(
        userId,
        portalCourseIds,
        theirs
          ? []
          : course.portalCourses.map(({ portal, externalId }) => ({
              portal,
              externalId,
            })),
      ),
    );
  }

  private course(userId: string, slug: CourseSlug) {
    return readableCourse(this.queries, userId, slug);
  }
}
