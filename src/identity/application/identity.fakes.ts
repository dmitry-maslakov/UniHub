import { ApiKeys } from '../domain/api-keys.js';
import { CourseAccessRepository } from '../domain/course-access.js';
import { ReaderRepository, type Reader } from '../domain/reader.js';

// In-memory ports for the application's unit tests.

export class InMemoryReaders extends ReaderRepository {
  constructor(readonly byId = new Map<string, Reader>()) {
    super();
  }

  async findById(userId: string) {
    return this.byId.get(userId) ?? null;
  }
}

// grants as "user:course"
export class InMemoryCourseAccess extends CourseAccessRepository {
  readonly grants = new Set<string>();

  async grant(userId: string, courseId: string) {
    const had = this.grants.has(`${userId}:${courseId}`);
    this.grants.add(`${userId}:${courseId}`);
    return !had;
  }

  async revoke(userId: string, courseId: string) {
    return this.grants.delete(`${userId}:${courseId}`);
  }

  async courseIds(userId: string) {
    return [...this.grants]
      .filter((grant) => grant.startsWith(`${userId}:`))
      .map((grant) => grant.slice(userId.length + 1));
  }
}

// keys by their secret
export class FakeApiKeys extends ApiKeys {
  constructor(
    readonly byKey = new Map<string, { keyId: string; userId: string }>(),
  ) {
    super();
  }

  async verify(key: string) {
    return this.byKey.get(key) ?? null;
  }
}
