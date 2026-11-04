import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { CourseAccessRepository } from '../domain/course-access.js';
import { UnknownUserError } from '../domain/errors.js';
import { ReaderRepository } from '../domain/reader.js';
import { ReadScopeQuery } from './queries.js';

@QueryHandler(ReadScopeQuery)
export class ReadScopeHandler implements IQueryHandler<ReadScopeQuery> {
  constructor(
    private readonly readers: ReaderRepository,
    private readonly access: CourseAccessRepository,
  ) {}

  async execute({ userId }: ReadScopeQuery) {
    const [reader, granted] = await Promise.all([
      this.readers.findById(userId),
      this.access.courseIds(userId),
    ]);
    if (!reader) throw new UnknownUserError(userId);
    return reader.scope(granted);
  }
}
