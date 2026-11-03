// a plugin referred to something it never sent (an item before its course...)
export class UnknownReferenceError extends Error {
  constructor(
    readonly portal: string,
    readonly externalId: string,
  ) {
    super(`${portal}: unknown reference ${externalId}`);
    this.name = 'UnknownReferenceError';
  }
}

export class UnknownCourseError extends Error {
  constructor(readonly slug: string) {
    super(`unknown course ${slug}`);
    this.name = 'UnknownCourseError';
  }
}

export class CourseSlugTakenError extends Error {
  constructor(readonly slug: string) {
    super(`course ${slug} already exists`);
    this.name = 'CourseSlugTakenError';
  }
}
