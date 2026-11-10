import { Command } from '@nestjs/cqrs';
import type { CourseState } from '../domain/course-switches.js';

// These portal courses of the user's shown, hidden or turned off
// (CourseSwitches.set). Whose they are isn't checked here: access sends it
// for the portal courses of a course the user reads, or turned off.
export class SetCourseStateCommand extends Command<void> {
  constructor(
    public readonly userId: string,
    public readonly portalCourseIds: readonly string[],
    public readonly state: CourseState,
  ) {
    super();
  }
}
