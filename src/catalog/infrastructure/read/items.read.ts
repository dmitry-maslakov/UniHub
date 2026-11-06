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
import { itemValues } from '../rows.js';
import { visibleItem } from './visibility.js';

const select = {
  id: true,
  portal: true,
  externalId: true,
  portalCourseId: true,
  kind: true,
  title: true,
  url: true,
  publishedAt: true,
  raw: true,
  removedAt: true,
} satisfies Prisma.ItemSelect;

// the course a visible item shows in (see visibleItem)
const withCourse = {
  portalCourse: { select: { link: { select: { courseId: true } } } },
} satisfies Prisma.ItemSelect;

const newestFirst = [
  { publishedAt: { sort: 'desc', nulls: 'last' } },
  { id: 'asc' },
] satisfies Prisma.ItemOrderByWithRelationInput[];

const toDto = ({
  removedAt,
  ...row
}: Prisma.ItemGetPayload<{ select: typeof select }>): ItemDto => ({
  ...row,
  ...itemValues(row),
  removed: removedAt !== null,
});

@QueryHandler(ListCourseItemsQuery)
export class ListCourseItemsHandler implements IQueryHandler<ListCourseItemsQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ courseId, offset, limit }: ListCourseItemsQuery) {
    const rows = await this.txHost.tx.item.findMany({
      where: visibleItem({ courseId }),
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
    const row = await this.txHost.tx.item.findUnique({
      where: { id },
      select,
    });
    return row && toDto(row);
  }
}

@QueryHandler(GetCourseItemQuery)
export class GetCourseItemHandler implements IQueryHandler<GetCourseItemQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ itemId }: GetCourseItemQuery) {
    const row = await this.txHost.tx.item.findFirst({
      where: { AND: [{ id: itemId }, visibleItem()] },
      select: { ...select, ...withCourse },
    });
    const courseId = row?.portalCourse?.link?.courseId;
    if (!row || !courseId) return null;
    const { portalCourse: _, ...item } = row;
    return { ...toDto(item), courseId };
  }
}

@QueryHandler(ListVisibleItemsQuery)
export class ListVisibleItemsHandler implements IQueryHandler<ListVisibleItemsQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ courseIds }: ListVisibleItemsQuery) {
    const rows = await this.txHost.tx.item.findMany({
      where: visibleItem({ courseId: { in: [...courseIds] } }),
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
      const courseId = portalCourse?.link?.courseId;
      return courseId ? [{ itemId: id, courseId, ...row }] : [];
    });
  }
}

@QueryHandler(ListItemsQuery)
export class ListItemsHandler implements IQueryHandler<ListItemsQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ after, limit }: ListItemsQuery) {
    const rows = await this.txHost.tx.item.findMany({
      where: { removedAt: null, ...(after && { id: { gt: after } }) },
      orderBy: { id: 'asc' },
      take: limit,
      select,
    });
    return rows.map(toDto);
  }
}
