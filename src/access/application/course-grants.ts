import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  FindCourseQuery,
  UnknownCourseError,
} from '../../catalog/contracts.js';
import {
  GrantCourseAccessCommand,
  RevokeCourseAccessCommand,
} from '../../identity/contracts.js';

// Who reads which course, as admins set it. Identity keeps the grants by
// catalog's course id and knows no courses, so a grant's course is looked up
// here first: a grant of an id no course has would read nothing. A revoke
// isn't checked: taking a grant back never lets anyone read more, and it has
// to clear one whose course catalog doesn't have (a typo, a deleted course).
// Identity refuses a user it doesn't know.
@Injectable()
export class CourseGrants {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  async grant(userId: string, courseId: string) {
    const course = await this.queries.execute(
      new FindCourseQuery({ id: courseId }),
    );
    if (!course) throw new UnknownCourseError(courseId);
    await this.commands.execute(new GrantCourseAccessCommand(userId, courseId));
  }

  async revoke(userId: string, courseId: string) {
    await this.commands.execute(
      new RevokeCourseAccessCommand(userId, courseId),
    );
  }
}
