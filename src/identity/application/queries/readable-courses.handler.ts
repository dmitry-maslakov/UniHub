import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { CourseAccessRepository } from '../../domain/course-access.js';
import { UnknownUserError } from '../../domain/errors.js';
import { isAdmin, UserRepository } from '../../domain/user.js';
import { ReadableCoursesQuery } from './readable-courses.query.js';

@QueryHandler(ReadableCoursesQuery)
export class ReadableCoursesHandler implements IQueryHandler<ReadableCoursesQuery> {
  constructor(
    private readonly users: UserRepository,
    private readonly access: CourseAccessRepository,
  ) {}

  async execute({ userId }: ReadableCoursesQuery) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnknownUserError(userId);
    if (isAdmin(user)) return { all: true as const };
    return {
      all: false as const,
      courseIds: await this.access.courseIds(userId),
    };
  }
}
