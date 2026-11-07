import { Query } from '@nestjs/cqrs';
import type { ReadScope } from '../domain/read-scope.js';

// what a user may read now (ReadScope); UnknownUserError for an id no
// user has
export class ReadScopeQuery extends Query<ReadScope> {
  constructor(public readonly userId: string) {
    super();
  }
}

// whether the user may do what only admins may, now: an admin, not banned;
// UnknownUserError for an id no user has
export class IsAdminQuery extends Query<boolean> {
  constructor(public readonly userId: string) {
    super();
  }
}

// how many users are granted each of these courses (by catalog's course
// id); a course nobody is granted has no entry
export class CountCourseReadersQuery extends Query<
  ReadonlyMap<string, number>
> {
  constructor(public readonly courseIds: readonly string[]) {
    super();
  }
}

export interface CourseReaderDto {
  userId: string;
  name: string;
  email: string;
  // banned now: for good, or until a time to come
  banned: boolean;
}

// the users granted a course, by name; admins who read every course
// without a grant are not among them
export class ListCourseReadersQuery extends Query<CourseReaderDto[]> {
  constructor(public readonly courseId: string) {
    super();
  }
}
