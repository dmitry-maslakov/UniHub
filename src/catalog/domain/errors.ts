import { ConflictError, NotFoundError } from '@app/kernel';

// a plugin referred to something it never sent (an item before its course...)
export class UnknownReferenceError extends NotFoundError {
  constructor(
    readonly portal: string,
    readonly externalId: string,
  ) {
    super(`${portal}: unknown reference ${externalId}`);
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
