import { Injectable } from '@nestjs/common';
import {
  InjectTransactionHost,
  Transactional,
} from '@nestjs-cls/transactional';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import {
  CourseSwitchRepository,
  type CourseState,
} from '../domain/course-switches.js';

@Injectable()
export class PrismaCourseSwitchRepository extends CourseSwitchRepository {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  async ofUser(userId: string) {
    const rows = await this.txHost.tx.courseSwitch.findMany({
      where: { userId },
      select: { portalCourseId: true, state: true },
      orderBy: { portalCourseId: 'asc' },
    });
    const of = (state: string) =>
      rows
        .filter((row) => row.state === state)
        .map((row) => row.portalCourseId);
    return { hidden: of('hidden'), off: of('off') };
  }

  // the rows replaced: Prisma's createMany updates none that is there
  @Transactional()
  async set(
    userId: string,
    portalCourseIds: readonly string[],
    state: Exclude<CourseState, 'shown'>,
  ) {
    await this.clear(userId, portalCourseIds);
    await this.txHost.tx.courseSwitch.createMany({
      data: portalCourseIds.map((portalCourseId) => ({
        userId,
        portalCourseId,
        state,
      })),
    });
  }

  async clear(userId: string, portalCourseIds: readonly string[]) {
    await this.txHost.tx.courseSwitch.deleteMany({
      where: { userId, portalCourseId: { in: [...portalCourseIds] } },
    });
  }

  async removeAllOf(userId: string) {
    await this.txHost.tx.courseSwitch.deleteMany({ where: { userId } });
  }
}
