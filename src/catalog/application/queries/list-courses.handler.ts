import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { CourseRepository } from '../../domain/course.js';
import { PortalCourseRepository } from '../../domain/portal-course.js';
import { ListCoursesQuery } from './list-courses.query.js';

@QueryHandler(ListCoursesQuery)
export class ListCoursesHandler implements IQueryHandler<ListCoursesQuery> {
  constructor(
    private readonly courses: CourseRepository,
    private readonly portalCourses: PortalCourseRepository,
  ) {}

  async execute() {
    const courses = await this.courses.list();
    const links = await this.courses.linksOf(courses.map((c) => c.id));
    const portalCourses = new Map(
      (
        await Promise.all(
          links.map((l) => this.portalCourses.findById(l.portalCourseId)),
        )
      )
        .filter((p) => p !== null)
        .map((p) => [p.id, p]),
    );

    return courses.map((course) => ({
      id: course.id,
      slug: course.slug,
      name: course.name,
      portalCourses: links
        .filter((l) => l.courseId === course.id)
        .map((l) => {
          const p = portalCourses.get(l.portalCourseId)!;
          return {
            id: p.id,
            portal: p.portal,
            externalId: p.externalId,
            name: p.name,
            year: l.year,
          };
        }),
    }));
  }
}
