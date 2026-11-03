import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { CourseRepository } from '../../domain/course.js';
import { FindCourseQuery } from './find-course.query.js';

@QueryHandler(FindCourseQuery)
export class FindCourseHandler implements IQueryHandler<FindCourseQuery> {
  constructor(private readonly courses: CourseRepository) {}

  async execute({ slug }: FindCourseQuery) {
    const found = await this.courses.findBySlug(slug);
    return found && { id: found.id, slug: found.slug, name: found.name };
  }
}
