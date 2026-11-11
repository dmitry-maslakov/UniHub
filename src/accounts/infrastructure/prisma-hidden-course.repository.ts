import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import { HiddenCourseRepository } from '../domain/hidden-courses.js';

@Injectable()
export class PrismaHiddenCourseRepository extends HiddenCourseRepository {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  async ofUser(userId: string) {
    const rows = await this.txHost.tx.hiddenCourse.findMany({
      where: { userId },
      select: { portalCourseId: true },
      orderBy: { portalCourseId: 'asc' },
    });
    return rows.map(({ portalCourseId }) => portalCourseId);
  }

  async hide(userId: string, portalCourseIds: readonly string[]) {
    await this.txHost.tx.hiddenCourse.createMany({
      data: portalCourseIds.map((portalCourseId) => ({
        userId,
        portalCourseId,
      })),
      skipDuplicates: true,
    });
  }

  async show(userId: string, portalCourseIds: readonly string[]) {
    await this.txHost.tx.hiddenCourse.deleteMany({
      where: { userId, portalCourseId: { in: [...portalCourseIds] } },
    });
  }

  async removeAllOf(userId: string) {
    await this.txHost.tx.hiddenCourse.deleteMany({ where: { userId } });
  }
}
