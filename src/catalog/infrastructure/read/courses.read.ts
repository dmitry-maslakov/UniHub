import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTxHost } from '../../../platform/database/prisma.service.js';
import {
  FindCourseQuery,
  GetPortalCourseQuery,
  ListCoursesQuery,
  type CourseDto,
} from '../../application/queries.js';
import { portalCourseValues, portalOf } from '../rows.js';

@QueryHandler(ListCoursesQuery)
export class ListCoursesHandler implements IQueryHandler<ListCoursesQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  // the courses and their portal courses in one go, whatever their number
  async execute(): Promise<CourseDto[]> {
    const courses = await this.txHost.tx.course.findMany({
      orderBy: { slug: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        links: {
          // postgres puts nulls last: the portal courses that span years
          orderBy: [{ year: 'asc' }, { portalCourseId: 'asc' }],
          select: {
            year: true,
            portalCourse: {
              select: { id: true, portal: true, externalId: true, name: true },
            },
          },
        },
      },
    });
    return courses.map(({ links, ...course }) => ({
      ...course,
      portalCourses: links.map(({ year, portalCourse }) => ({
        ...portalCourse,
        portal: portalOf(portalCourse),
        year,
      })),
    }));
  }
}

@QueryHandler(FindCourseQuery)
export class FindCourseHandler implements IQueryHandler<FindCourseQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  execute({ by }: FindCourseQuery) {
    return this.txHost.tx.course.findUnique({
      where: by,
      select: { id: true, slug: true, name: true },
    });
  }
}

@QueryHandler(GetPortalCourseQuery)
export class GetPortalCourseHandler implements IQueryHandler<GetPortalCourseQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ id }: GetPortalCourseQuery) {
    const row = await this.txHost.tx.portalCourse.findUnique({
      where: { id },
      select: {
        id: true,
        portal: true,
        externalId: true,
        name: true,
        url: true,
        meta: true,
      },
    });
    return row && { ...row, ...portalCourseValues(row) };
  }
}
