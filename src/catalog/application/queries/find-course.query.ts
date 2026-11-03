import { Query } from '@nestjs/cqrs';

export interface CourseRef {
  id: string;
  slug: string;
  name: string;
}

// by slug
export class FindCourseQuery extends Query<CourseRef | null> {
  constructor(public readonly slug: string) {
    super();
  }
}
