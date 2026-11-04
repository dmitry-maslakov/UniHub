import { CommandHandler, QueryBus, type ICommandHandler } from '@nestjs/cqrs';
import { CourseAccessRepository } from '../../domain/course-access.js';
import { ReaderRepository } from '../../domain/reader.js';
import { courseOf } from './course-of.js';
import { RevokeCourseAccessCommand } from './revoke-course-access.command.js';

@CommandHandler(RevokeCourseAccessCommand)
export class RevokeCourseAccessHandler implements ICommandHandler<RevokeCourseAccessCommand> {
  constructor(
    private readonly queries: QueryBus,
    private readonly users: ReaderRepository,
    private readonly access: CourseAccessRepository,
  ) {}

  async execute({ userId, courseSlug }: RevokeCourseAccessCommand) {
    const courseId = await courseOf(
      this.queries,
      this.users,
      userId,
      courseSlug,
    );
    return { changed: await this.access.revoke(userId, courseId) };
  }
}
