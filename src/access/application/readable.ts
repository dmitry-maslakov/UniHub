import type { QueryBus } from '@nestjs/cqrs';
import {
  GetCourseFileQuery,
  GetCourseItemQuery,
  ListCoursesQuery,
  type CourseSlug,
} from '../../catalog/contracts.js';
import { NotReadableError } from './errors.js';
import { viewersOfUser } from './viewers.js';

// What a user may read, for each use case of access. The rules are the
// owners': identity's ReadScope and accounts' accounts say whose views the
// user reads (viewers.ts), catalog finds only what those views show. Here
// they are asked together, and whatever the user can't read is a
// NotReadableError, so a caller can't tell "not yours" from "doesn't
// exist".

// the courses the user reads, each with its portal courses in their view
export async function readableCourses(queries: QueryBus, userId: string) {
  const viewers = await viewersOfUser(queries, userId);
  return {
    viewers,
    courses: await queries.execute(new ListCoursesQuery(viewers)),
  };
}

export async function readableCourse(
  queries: QueryBus,
  userId: string,
  slug: CourseSlug,
) {
  const { viewers, courses } = await readableCourses(queries, userId);
  const course = courses.find((c) => c.slug === slug);
  if (!course) throw new NotReadableError('course');
  return {
    viewers,
    course,
    portalCourseIds: course.portalCourses.map(({ id }) => id),
  };
}

export async function readableItem(
  queries: QueryBus,
  userId: string,
  itemId: string,
) {
  const viewers = await viewersOfUser(queries, userId);
  const item = await queries.execute(new GetCourseItemQuery(viewers, itemId));
  if (!item) throw new NotReadableError('item');
  return item;
}

export async function readableFile(
  queries: QueryBus,
  userId: string,
  fileId: string,
) {
  const viewers = await viewersOfUser(queries, userId);
  const file = await queries.execute(new GetCourseFileQuery(viewers, fileId));
  if (!file) throw new NotReadableError('file');
  return file;
}
