import { Command } from '@nestjs/cqrs';

// Who reads which course, by catalog's course id; `changed` is false when
// the user already had it, or didn't. Only admins call these (@Roles at the
// route), so they name no actor.
export abstract class CourseAccessCommand extends Command<{
  changed: boolean;
}> {
  constructor(
    public readonly userId: string,
    public readonly courseId: string,
  ) {
    super();
  }
}

export class GrantCourseAccessCommand extends CourseAccessCommand {}

export class RevokeCourseAccessCommand extends CourseAccessCommand {}
