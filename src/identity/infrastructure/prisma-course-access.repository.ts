import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { CourseAccessRepository } from '../domain/course-access.js';

@Injectable()
export class PrismaCourseAccessRepository extends CourseAccessRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {
    super();
  }

  async grant(userId: string, courseId: string) {
    const { count } = await this.txHost.tx.courseAccess.createMany({
      data: { userId, courseId },
      skipDuplicates: true,
    });
    return count > 0;
  }

  async revoke(userId: string, courseId: string) {
    const { count } = await this.txHost.tx.courseAccess.deleteMany({
      where: { userId, courseId },
    });
    return count > 0;
  }

  async courseIds(userId: string) {
    const rows = await this.txHost.tx.courseAccess.findMany({
      where: { userId },
      select: { courseId: true },
      orderBy: { courseId: 'asc' },
    });
    return rows.map((r) => r.courseId);
  }
}
