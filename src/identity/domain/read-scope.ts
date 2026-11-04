// The courses someone may read, by catalog's course ids: every one, or only
// some (none at all included).
export class ReadScope {
  private constructor(private readonly courses: 'all' | ReadonlySet<string>) {}

  static all() {
    return new ReadScope('all');
  }

  static none() {
    return ReadScope.of([]);
  }

  static of(courseIds: Iterable<string>) {
    return new ReadScope(new Set(courseIds));
  }

  allows(courseId: string) {
    return this.courses === 'all' || this.courses.has(courseId);
  }
}
