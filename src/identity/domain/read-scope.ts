// What someone may read: the courses they read through the shared account,
// by catalog's course ids (every one, or only some, none at all included),
// and whether they read through accounts of their own at all. A ban stops
// both.
export class ReadScope {
  private constructor(
    private readonly courses: 'all' | ReadonlySet<string>,
    readonly ownAccounts: boolean,
  ) {}

  static all() {
    return new ReadScope('all', true);
  }

  // a ban: nothing, through any account
  static none() {
    return new ReadScope(new Set(), false);
  }

  static of(courseIds: Iterable<string>) {
    return new ReadScope(new Set(courseIds), true);
  }

  allows(courseId: string) {
    return this.courses === 'all' || this.courses.has(courseId);
  }

  // the courses it names; null for every one
  get granted(): readonly string[] | null {
    return this.courses === 'all' ? null : [...this.courses];
  }
}
