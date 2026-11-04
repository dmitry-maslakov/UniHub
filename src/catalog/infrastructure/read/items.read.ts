import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTxHost } from '../../../platform/database/prisma.service.js';
import {
  GetItemQuery,
  ListCourseItemsQuery,
  type ItemDto,
} from '../../application/queries.js';
import { itemValues } from '../rows.js';

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
      where: { removedAt: null, portalCourse: { link: { courseId } } },
      orderBy: [
        { publishedAt: { sort: 'desc', nulls: 'last' } },
        { id: 'asc' },
      ],
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
