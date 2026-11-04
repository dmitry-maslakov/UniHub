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
// catalog's course id and knows no courses, so the course is looked up here
// first: a grant of an id no course has would read nothing. Identity refuses
// a user it doesn't know.
@Injectable()
export class CourseGrants {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  grant(userId: string, courseId: string) {
    return this.send(new GrantCourseAccessCommand(userId, courseId));
  }

  revoke(userId: string, courseId: string) {
    return this.send(new RevokeCourseAccessCommand(userId, courseId));
  }

  private async send(
    command: GrantCourseAccessCommand | RevokeCourseAccessCommand,
  ) {
    const course = await this.queries.execute(
      new FindCourseQuery({ id: command.courseId }),
    );
    if (!course) throw new UnknownCourseError(command.courseId);
    await this.commands.execute(command);
  }
}
