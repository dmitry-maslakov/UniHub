import { Query } from '@nestjs/cqrs';

// admins read every course, everyone else the ones granted to them
export type ReadableCourses =
  { all: true } | { all: false; courseIds: string[] };

export class ReadableCoursesQuery extends Query<ReadableCourses> {
  constructor(public readonly userId: string) {
    super();
  }
}
