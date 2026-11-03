import { Query } from '@nestjs/cqrs';

// the course a portal course is linked to, null if it isn't
export class CourseOfQuery extends Query<string | null> {
  constructor(public readonly portalCourseId: string) {
    super();
  }
}
