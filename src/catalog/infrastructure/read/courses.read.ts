import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTxHost } from '../../../platform/database/prisma.service.js';
import {
  FindCourseQuery,
  GetPortalCourseQuery,
  ListCoursesQuery,
  type CourseDto,
} from '../../application/queries.js';
import { courseValues, portalOf, seenByShared } from '../rows.js';

// a portal course as the shared account sees it: its version
const sharedVersion = {
  where: { sights: seenByShared },
  take: 1,
} as const;

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
          where: {
            portalCourse: { versions: { some: { sights: seenByShared } } },
          },
          // postgres puts nulls last: the portal courses that span years
          orderBy: [{ year: 'asc' }, { portalCourseId: 'asc' }],
          select: {
            year: true,
            portalCourse: {
              select: {
                id: true,
                portal: true,
                externalId: true,
                versions: { ...sharedVersion, select: { name: true } },
              },
            },
          },
        },
      },
    });
    return courses.map(({ links, ...course }) => ({
      ...course,
      portalCourses: links.map(
        ({ year, portalCourse: { versions, ...portalCourse } }) => ({
          ...portalCourse,
          portal: portalOf(portalCourse),
          name: versions[0].name,
          year,
        }),
      ),
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
        versions: {
          ...sharedVersion,
          select: { name: true, url: true, meta: true },
        },
      },
    });
    const version = row?.versions[0];
    if (!row || !version) return null;
    const { versions: _, ...course } = row;
    return {
      ...course,
      portal: portalOf(course),
      name: version.name,
      url: version.url,
      ...courseValues(version),
    };
  }
}
