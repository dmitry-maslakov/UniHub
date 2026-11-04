import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import { CourseAccessRepository } from '../domain/course-access.js';

@Injectable()
export class PrismaCourseAccessRepository extends CourseAccessRepository {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
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
