// a subject as we know it, made of courses in one or more portals
export interface Course {
  id: string;
  slug: string;
  name: string;
}

export interface CourseLink {
  courseId: string;
  portalCourseId: string;
  // academic year the portal course is for; null when it spans years
  year: number | null;
}

export abstract class CourseRepository {
  // null if the slug is taken
  abstract create(slug: string, name: string): Promise<Course | null>;
  abstract findBySlug(slug: string): Promise<Course | null>;
  abstract list(): Promise<Course[]>;
  // a portal course belongs to one course: linking it again moves it
  abstract link(link: CourseLink): Promise<void>;
  abstract unlink(portalCourseId: string): Promise<boolean>;
  abstract linksOf(courseIds: string[]): Promise<CourseLink[]>;
  // the course a portal course is linked to
  abstract courseIdOf(portalCourseId: string): Promise<string | null>;
}
