import { CommandHandler, QueryBus, type ICommandHandler } from '@nestjs/cqrs';
import { CourseAccessRepository } from '../../domain/course-access.js';
import { UserRepository } from '../../domain/user.js';
import { courseOf } from './course-of.js';
import { GrantCourseAccessCommand } from './grant-course-access.command.js';

@CommandHandler(GrantCourseAccessCommand)
export class GrantCourseAccessHandler implements ICommandHandler<GrantCourseAccessCommand> {
  constructor(
    private readonly queries: QueryBus,
    private readonly users: UserRepository,
    private readonly access: CourseAccessRepository,
  ) {}

  async execute({ userId, courseSlug }: GrantCourseAccessCommand) {
    const courseId = await courseOf(
      this.queries,
      this.users,
      userId,
      courseSlug,
    );
    return { changed: await this.access.grant(userId, courseId) };
  }
}
