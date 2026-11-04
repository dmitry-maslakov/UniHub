import { randomUUID } from 'node:crypto';
import type { CourseName, Slug } from '../values.js';

// A subject as we know it, made of courses in one or more portals (see
// CourseLink). Admins make them; the slug is how people name it.
export class Course {
  private constructor(
    readonly id: string,
    readonly slug: Slug,
    readonly name: CourseName,
  ) {}

  static create(slug: Slug, name: CourseName) {
    return new Course(randomUUID(), slug, name);
  }

  static restore({
    id,
    slug,
    name,
  }: {
    id: string;
    slug: Slug;
    name: CourseName;
  }) {
    return new Course(id, slug, name);
  }
}
