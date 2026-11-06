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
  type ViewedItemDto,
  type Viewers,
} from '../../application/queries.js';
import { itemValues, liveSights, portalOf, recordRef, seen } from '../rows.js';
import {
  courseOf,
  inCourses,
  itemOpening,
  itemSeen,
  opens,
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

// a post as the viewers read it: its body once their view opens it
const forViewers = (viewers: Viewers, now: Date) =>
  ({
    ...select,
    _count: { select: { sights: { where: itemOpening(viewers, now) } } },
  }) satisfies Prisma.ItemVersionSelect;

const toViewersDto = ({
  _count,
  ...row
}: Prisma.ItemVersionGetPayload<{
  select: ReturnType<typeof forViewers>;
}>): ViewedItemDto => {
  const item = toDto(row);
  return { ...item, raw: _count.sights ? item.raw : null };
};

@QueryHandler(ListCourseItemsQuery)
export class ListCourseItemsHandler implements IQueryHandler<ListCourseItemsQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({
    viewers,
    portalCourseIds,
    offset,
    limit,
  }: ListCourseItemsQuery) {
    const now = new Date();
    const rows = await this.txHost.tx.itemVersion.findMany({
      where: { AND: [inCourses(portalCourseIds), itemSeen(viewers, now)] },
      orderBy: newestFirst,
      skip: offset,
      take: limit,
      select: forViewers(viewers, now),
    });
    return rows.map(toViewersDto);
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
    const now = new Date();
    const row = await this.txHost.tx.itemVersion.findFirst({
      where: { AND: [{ id: itemId }, itemSeen(viewers, now)] },
      select: { ...forViewers(viewers, now), ...withCourse },
    });
    const courseId = row && courseOf(row);
    if (!row || !courseId) return null;
    const { portalCourse: _, ...item } = row;
    return { ...toViewersDto(item), courseId };
  }
}

@QueryHandler(ListVisibleItemsQuery)
export class ListVisibleItemsHandler implements IQueryHandler<ListVisibleItemsQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ viewers, portalCourseIds }: ListVisibleItemsQuery) {
    const now = new Date();
    const rows = await this.txHost.tx.itemVersion.findMany({
      where: {
        AND: [inCourses(portalCourseIds), itemSeen(viewers, now, opens(now))],
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
