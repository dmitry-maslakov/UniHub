import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { CourseMatching } from './course-matching.js';
import { OwnPortalCourseQuery, PickMatchesQuery } from './queries.js';

@QueryHandler(OwnPortalCourseQuery)
export class OwnPortalCourseHandler implements IQueryHandler<OwnPortalCourseQuery> {
  constructor(private readonly matching: CourseMatching) {}

  execute({ userId, slug }: OwnPortalCourseQuery) {
    return this.matching.ownPortalCourse(userId, slug);
  }
}

@QueryHandler(PickMatchesQuery)
export class PickMatchesHandler implements IQueryHandler<PickMatchesQuery> {
  constructor(private readonly matching: CourseMatching) {}

  execute({ userId, portalCourseIds }: PickMatchesQuery) {
    return this.matching.matches(userId, portalCourseIds);
  }
}
