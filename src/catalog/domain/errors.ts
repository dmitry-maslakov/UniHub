import { ConflictError, InvalidError, NotFoundError } from '@app/kernel';
import type { PortalRef } from './portal-ref.js';

// a plugin referred to something it never sent (an item before its course...)
export class UnknownReferenceError extends NotFoundError {
  readonly reason = 'UNKNOWN_REFERENCE';

  constructor(
    readonly portal: string,
    readonly externalId: string,
  ) {
    super(`${portal}: unknown reference ${externalId}`);
  }
}

// a file that names a course, and a post that is in another one
export class MisplacedFileError extends InvalidError {
  readonly reason = 'FILE_COURSE_MISMATCH';

  constructor(
    readonly course: PortalRef,
    readonly item: PortalRef,
  ) {
    super(
      `${item.portal}: post ${item.externalId} isn't in course ${course.externalId}`,
    );
  }
}

// no course has this slug, or this id
export class UnknownCourseError extends NotFoundError {
  readonly reason = 'UNKNOWN_COURSE';

  constructor(readonly course: string) {
    super(`unknown course ${course}`);
  }
}

export class CourseSlugTakenError extends ConflictError {
  readonly reason = 'COURSE_SLUG_TAKEN';

  constructor(readonly slug: string) {
    super(`course ${slug} already exists`);
  }
}
