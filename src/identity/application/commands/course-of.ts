import type { QueryBus } from '@nestjs/cqrs';
import {
  FindCourseQuery,
  UnknownCourseError,
} from '../../../catalog/contracts.js';
import { UnknownUserError } from '../../domain/errors.js';
import type { ReaderRepository } from '../../domain/reader.js';

// the course's id, after checking both ends exist
export async function courseOf(
  queries: QueryBus,
  users: ReaderRepository,
  userId: string,
  courseSlug: string,
) {
  if (!(await users.findById(userId))) throw new UnknownUserError(userId);
  const course = await queries.execute(new FindCourseQuery(courseSlug));
  if (!course) throw new UnknownCourseError(courseSlug);
  return course.id;
}
