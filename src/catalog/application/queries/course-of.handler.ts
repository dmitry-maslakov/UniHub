import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { CourseRepository } from '../../domain/course.js';
import { CourseOfQuery } from './course-of.query.js';

@QueryHandler(CourseOfQuery)
export class CourseOfHandler implements IQueryHandler<CourseOfQuery> {
  constructor(private readonly courses: CourseRepository) {}

  execute({ portalCourseId }: CourseOfQuery) {
    return this.courses.courseIdOf(portalCourseId);
  }
}
