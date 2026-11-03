import { Query } from '@nestjs/cqrs';

export interface CourseDto {
  id: string;
  slug: string;
  name: string;
  portalCourses: {
    id: string;
    portal: string;
    externalId: string;
    name: string;
    year: number | null;
  }[];
}

export class ListCoursesQuery extends Query<CourseDto[]> {}
