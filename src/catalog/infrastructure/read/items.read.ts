import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTxHost } from '../../../platform/database/prisma.service.js';
import {
  GetCourseItemQuery,
  GetItemQuery,
  ListCourseItemsQuery,
  ListItemsQuery,
  ListVisibleItemsQuery,
  type ItemDto,
} from '../../application/queries.js';
import { itemValues, liveSights, portalOf, recordRef, seen } from '../rows.js';
import {
  courseOf,
  inCourses,
  itemSeen,
  opens,
  shows,
  withCourse,
} from './viewers.js';

// a version, with its record's ids and whether any account sees it
const select = {
  id: true,
  portalCourseId: true,
  kind: true,
  title: true,
  url: true,
  publishedAt: true,
  raw: true,
  updatedAt: true,
  item: recordRef,
  sights: liveSights,
} satisfies Prisma.ItemVersionSelect;

const newestFirst = [
  { publishedAt: { sort: 'desc', nulls: 'last' } },
  { id: 'asc' },
] satisfies Prisma.ItemVersionOrderByWithRelationInput[];

const toDto = ({
  item,
  sights,
  ...row
}: Prisma.ItemVersionGetPayload<{ select: typeof select }>): ItemDto => ({
  ...row,
  ...itemValues(row),
  portal: portalOf(item),
  externalId: item.externalId,
  removed: sights.length === 0,
});

@QueryHandler(ListCourseItemsQuery)
export class ListCourseItemsHandler implements IQueryHandler<ListCourseItemsQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({
    viewers,
    portalCourseIds,
    offset,
    limit,
  }: ListCourseItemsQuery) {
    const rows = await this.txHost.tx.itemVersion.findMany({
      where: {
        AND: [inCourses(portalCourseIds), itemSeen(viewers, shows(new Date()))],
      },
      orderBy: newestFirst,
      skip: offset,
      take: limit,
      select,
    });
    return rows.map(toDto);
  }
}

@QueryHandler(GetItemQuery)
export class GetItemHandler implements IQueryHandler<GetItemQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ id }: GetItemQuery) {
    const row = await this.txHost.tx.itemVersion.findUnique({
      where: { id },
      select,
    });
    return row && toDto(row);
  }
}

@QueryHandler(GetCourseItemQuery)
export class GetCourseItemHandler implements IQueryHandler<GetCourseItemQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ viewers, itemId }: GetCourseItemQuery) {
    const row = await this.txHost.tx.itemVersion.findFirst({
      where: { AND: [{ id: itemId }, itemSeen(viewers, shows(new Date()))] },
      select: { ...select, ...withCourse },
    });
    const courseId = row && courseOf(row);
    if (!row || !courseId) return null;
    const { portalCourse: _, ...item } = row;
    return { ...toDto(item), courseId };
  }
}

@QueryHandler(ListVisibleItemsQuery)
export class ListVisibleItemsHandler implements IQueryHandler<ListVisibleItemsQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ viewers, portalCourseIds }: ListVisibleItemsQuery) {
    const rows = await this.txHost.tx.itemVersion.findMany({
      where: {
        AND: [inCourses(portalCourseIds), itemSeen(viewers, opens(new Date()))],
      },
      orderBy: newestFirst,
      select: {
        id: true,
        kind: true,
        title: true,
        url: true,
        publishedAt: true,
        ...withCourse,
      },
    });
    // the filter leaves only rows with a course, which Prisma's types can't
    // tell
    return rows.flatMap(({ id, portalCourse, ...row }) => {
      const courseId = courseOf({ portalCourse });
      return courseId ? [{ itemId: id, courseId, ...row }] : [];
    });
  }
}

@QueryHandler(ListItemsQuery)
export class ListItemsHandler implements IQueryHandler<ListItemsQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ after, limit }: ListItemsQuery) {
    const rows = await this.txHost.tx.itemVersion.findMany({
      where: { sights: seen, ...(after && { id: { gt: after } }) },
      orderBy: { id: 'asc' },
      take: limit,
      select: { id: true, updatedAt: true },
    });
    return rows;
  }
}
