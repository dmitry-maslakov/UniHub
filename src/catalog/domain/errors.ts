import { ConflictError, InvalidError, NotFoundError } from '@app/kernel';
import type { PortalRef } from './portal-ref.js';

// a plugin referred to something it never sent (an item before its course...)
export class UnknownReferenceError extends NotFoundError {
  constructor(
    readonly portal: string,
    readonly externalId: string,
  ) {
    super(`${portal}: unknown reference ${externalId}`);
  }
}

// a file that names a course, and a post that is in another one
export class MisplacedFileError extends InvalidError {
  constructor(
    readonly course: PortalRef,
    readonly item: PortalRef,
  ) {
    super(
      `${item.portal}: post ${item.externalId} isn't in course ${course.externalId}`,
    );
  }
}

export class UnknownCourseError extends NotFoundError {
  constructor(readonly slug: string) {
    super(`unknown course ${slug}`);
  }
}

export class CourseSlugTakenError extends ConflictError {
  constructor(readonly slug: string) {
    super(`course ${slug} already exists`);
  }
}
