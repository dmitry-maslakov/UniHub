import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTxHost } from '../../../platform/database/prisma.service.js';
import {
  ListPortalCatalogQuery,
  ListSharedPortalCoursesQuery,
  type CatalogCourseDto,
  type SharedPortalCourseDto,
} from '../../application/queries.js';
import { portalOf, sharedSight } from '../rows.js';
import { shows } from './viewers.js';

@QueryHandler(ListPortalCatalogQuery)
export class ListPortalCatalogHandler implements IQueryHandler<ListPortalCatalogQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  // each course's version the shared account shows now, and its sight's
  // first showing: the shared account's sight is shown from the first time
  // it sent the record, and stays so
  async execute({
    portal,
    externalId,
  }: ListPortalCatalogQuery): Promise<CatalogCourseDto[]> {
    const sight = { ...sharedSight, ...shows(new Date()) };
    const rows = await this.txHost.tx.courseVersion.findMany({
      where: {
        sights: { some: sight },
        portalCourse: {
          portal,
          ...(externalId !== undefined && { externalId }),
        },
      },
      select: {
        name: true,
        url: true,
        portalCourse: { select: { id: true, externalId: true } },
        sights: { where: sight, select: { shownFrom: true } },
      },
    });
    return rows.map(({ name, url, portalCourse, sights: [first] }) => ({
      ...portalCourse,
      name,
      url,
      since: first.shownFrom,
    }));
  }
}

@QueryHandler(ListSharedPortalCoursesQuery)
export class ListSharedPortalCoursesHandler implements IQueryHandler<ListSharedPortalCoursesQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  // as ListPortalCatalogHandler, for every portal: each course's version
  // the shared account shows now
  async execute(): Promise<SharedPortalCourseDto[]> {
    const rows = await this.txHost.tx.courseVersion.findMany({
      where: { sights: { some: { ...sharedSight, ...shows(new Date()) } } },
      select: {
        name: true,
        portalCourse: {
          select: {
            id: true,
            portal: true,
            externalId: true,
            link: {
              select: {
                course: { select: { id: true, slug: true, name: true } },
              },
            },
          },
        },
      },
    });
    return rows.map(({ name, portalCourse: { link, ...course } }) => ({
      ...course,
      portal: portalOf(course),
      name,
      course: link?.course ?? null,
    }));
  }
}
