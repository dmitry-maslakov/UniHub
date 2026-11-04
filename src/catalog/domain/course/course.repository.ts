import type { Slug } from '../values.js';
import type { Course } from './course.js';

export abstract class CourseRepository {
  // false if another course has its slug
  abstract add(course: Course): Promise<boolean>;
  abstract findBySlug(slug: Slug): Promise<Course | null>;
}
