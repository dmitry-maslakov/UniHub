import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTxHost } from '../../../platform/database/prisma.service.js';
import {
  FindCourseQuery,
  GetPortalCourseQuery,
  ListCoursesQuery,
  type CourseDto,
} from '../../application/queries.js';
import { SHARED_ACCOUNT } from '@app/kernel';
import { portalCourseSlug, slugOfPortalCourse } from '../../domain/values.js';
import { courseValues, portalOf, seenByShared } from '../rows.js';
import { courseSeen, shows } from './viewers.js';

// a portal course as the shared account sees it: its version
const sharedVersion = {
  where: { sights: seenByShared },
  take: 1,
} as const;

const byPortalCourse = (a: { slug: string }, b: { slug: string }) =>
  a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;

@QueryHandler(ListCoursesQuery)
export class ListCoursesHandler implements IQueryHandler<ListCoursesQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  // the courses and their portal courses in one go, whatever their number;
  // of one slug, the admins' courses or the portal courses alone
  async execute({ viewers, slug }: ListCoursesQuery): Promise<CourseDto[]> {
    const { tx } = this.txHost;
    const now = new Date();
    const { accounts, shared, picks } = viewers;
    const own = slug === undefined ? undefined : slugOfPortalCourse(slug);
    // a portal course with each its name as the viewers see it
    const portalCourse = {
      select: {
        id: true,
        portal: true,
        externalId: true,
        versions: {
          where: { sights: { some: courseSeen(viewers, now) } },
          take: 1,
          select: { name: true, url: true },
        },
      },
    } as const;
    const seenBy = (account: string | { in: string[] }) => ({
      versions: { some: { sights: { some: { account, ...shows(now) } } } },
    });
    // through the shared account in a course granted, or the user's own
    const sharedPart = {
      ...(shared.courses && { courseId: { in: [...shared.courses] } }),
      portalCourse: {
        portal: { notIn: [...shared.except] },
        ...seenBy(SHARED_ACCOUNT),
      },
    };
    const ownPart = { portalCourse: seenBy({ in: [...accounts] }) };
    // or through the shared account in a public portal, picked
    const pickedCourse = {
      id: { in: [...picks.courses] },
      portal: { in: [...picks.portals] },
      ...seenBy(SHARED_ACCOUNT),
    };
    const pickedPart = { portalCourse: pickedCourse };
    const [courses, unlinked] = await Promise.all([
      own
        ? []
        : tx.course.findMany({
            where: {
              ...(slug !== undefined && { slug }),
              // an admin's every one
              ...(shared.courses && {
                OR: [
                  { id: { in: [...shared.courses] } },
                  { links: { some: ownPart } },
                  { links: { some: pickedPart } },
                ],
              }),
            },
            orderBy: { slug: 'asc' },
            select: {
              id: true,
              slug: true,
              name: true,
              links: {
                where: { OR: [sharedPart, ownPart, pickedPart] },
                // postgres puts nulls last: the portal courses that span
                // years
                orderBy: [{ year: 'asc' }, { portalCourseId: 'asc' }],
                select: { year: true, portalCourse },
              },
            },
          }),
      (accounts.length || picks.courses.length) && own !== null
        ? tx.portalCourse.findMany({
            where: {
              link: null,
              ...own,
              OR: [seenBy({ in: [...accounts] }), pickedCourse],
            },
            ...portalCourse,
          })
        : [],
    ]);
    const part = (
      { versions, ...course }: (typeof unlinked)[number],
      year: number | null,
    ) => ({
      ...course,
      portal: portalOf(course),
      name: versions[0].name,
      url: versions[0].url,
      year,
    });
    return [
      ...courses.map(({ links, ...course }) => ({
        ...course,
        portalCourses: links.map(({ year, portalCourse }) =>
          part(portalCourse, year),
        ),
      })),
      ...unlinked
        .map((course) => {
          const entry = part(course, null);
          return {
            id: entry.id,
            slug: portalCourseSlug(entry.portal, entry.externalId),
            name: entry.name,
            portalCourses: [entry],
          };
        })
        // a hashed id is found by its portal, then by its slug
        .filter((course) => slug === undefined || course.slug === slug)
        .sort(byPortalCourse),
    ];
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
