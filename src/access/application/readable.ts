import type { Query, QueryBus } from '@nestjs/cqrs';
import {
  FindCourseQuery,
  GetCourseFileQuery,
  ListCoursesQuery,
  type Slug,
} from '../../catalog/contracts.js';
import { ReadScopeQuery } from '../../identity/contracts.js';
import { NotReadableError } from './errors.js';

// What a user may read, for each use case of access. The rules are the
// owners': catalog finds only what a course shows, identity's ReadScope says
// which courses the user reads. Here they are asked together, and whatever the
// user can't read is a NotReadableError, so a caller can't tell "not yours"
// from "doesn't exist".

// the courses the user's scope allows; both asked for at once
export async function readableCourses(queries: QueryBus, userId: string) {
  const [courses, scope] = await Promise.all([
    queries.execute(new ListCoursesQuery()),
    queries.execute(new ReadScopeQuery(userId)),
  ]);
  return courses.filter(({ id }) => scope.allows(id));
}

export const readableCourse = (queries: QueryBus, userId: string, slug: Slug) =>
  readable(queries, userId, 'course', {
    query: new FindCourseQuery({ slug }),
    courseOf: ({ id }) => id,
  });

export const readableFile = (
  queries: QueryBus,
  userId: string,
  fileId: string,
) =>
  readable(queries, userId, 'file', {
    query: new GetCourseFileQuery(fileId),
    courseOf: ({ courseId }) => courseId,
  });

// what the query finds, if the user may read the course it is in; the
// thing and the user's scope are asked for at once
async function readable<T>(
  queries: QueryBus,
  userId: string,
  what: NotReadableError['what'],
  find: { query: Query<T | null>; courseOf: (found: T) => string },
) {
  const [found, scope] = await Promise.all([
    queries.execute(find.query),
    queries.execute(new ReadScopeQuery(userId)),
  ]);
  if (!found || !scope.allows(find.courseOf(found)))
    throw new NotReadableError(what);
  return found;
}
