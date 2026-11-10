import type { QueryBus } from '@nestjs/cqrs';
import {
  GetCourseFileQuery,
  GetCourseItemQuery,
  ListCoursesQuery,
  type CourseSlug,
  type Viewers,
} from '../../catalog/contracts.js';
import { NotReadableError } from './errors.js';
import { regroup } from './grouping.js';
import { readingOf, viewersOfUser } from './viewers.js';

// What a user may read, for each use case of access. The rules are the
// owners': identity's ReadScope and accounts' accounts say whose views the
// user reads (viewers.ts), catalog finds only what those views show. Here
// they are asked together, and whatever the user can't read is a
// NotReadableError, so a caller can't tell "not yours" from "doesn't
// exist".

// The courses the user reads, as they see them (grouping.ts), each with
// its portal courses in their view: their own (`listed`), and the public
// portals' they didn't pick
export async function readableCourses(queries: QueryBus, userId: string) {
  const { viewers, into, showing } = await readingOf(queries, userId);
  const courses = await queries.execute(new ListCoursesQuery(viewers));
  return {
    viewers,
    into,
    showing,
    courses: regroup(courses, viewers, into, showing),
  };
}

// the user's own courses of them: what a list of their courses shows,
// those they hide too
export async function listedCourses(queries: QueryBus, userId: string) {
  const { courses, ...reading } = await readableCourses(queries, userId);
  return { ...reading, courses: courses.filter(({ listed }) => listed) };
}

// One of them by its slug. A pick shown with another course moves out of
// its own, so with one the courses are all regrouped; else the one of that
// slug is found alone.
export async function readableCourse(
  queries: QueryBus,
  userId: string,
  slug: CourseSlug,
) {
  const { viewers, into, showing } = await readingOf(queries, userId);
  const courses = await queries.execute(
    new ListCoursesQuery(viewers, into.size ? undefined : slug),
  );
  const course = regroup(courses, viewers, into, showing).find(
    (c) => c.slug === slug,
  );
  if (!course) throw new NotReadableError('course');
  return {
    viewers,
    showing,
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
  return fileOf(queries, await viewersOfUser(queries, userId), fileId);
}

// the same for viewers asked for already, when many files are read at once
export async function fileOf(
  queries: QueryBus,
  viewers: Viewers,
  fileId: string,
) {
  const file = await queries.execute(new GetCourseFileQuery(viewers, fileId));
  if (!file) throw new NotReadableError('file');
  return file;
}
