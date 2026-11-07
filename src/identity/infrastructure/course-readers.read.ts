import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import {
  CountCourseReadersQuery,
  ListCourseReadersQuery,
  type CourseReaderDto,
} from '../application/queries.js';
import { readerColumns, toReader } from './reader.mapper.js';

@QueryHandler(CountCourseReadersQuery)
export class CountCourseReadersHandler implements IQueryHandler<CountCourseReadersQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({ courseIds }: CountCourseReadersQuery) {
    const rows = await this.txHost.tx.courseAccess.groupBy({
      by: ['courseId'],
      where: { courseId: { in: [...courseIds] } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.courseId, row._count._all]));
  }
}

@QueryHandler(ListCourseReadersQuery)
export class ListCourseReadersHandler implements IQueryHandler<ListCourseReadersQuery> {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {}

  async execute({
    courseId,
  }: ListCourseReadersQuery): Promise<CourseReaderDto[]> {
    const users = await this.txHost.tx.user.findMany({
      where: { courseAccess: { some: { courseId } } },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      select: { id: true, name: true, email: true, ...readerColumns },
    });
    const now = new Date();
    return users.map((user) => ({
      userId: user.id,
      name: user.name,
      email: user.email,
      banned: toReader(user).bannedAt(now),
    }));
  }
}
