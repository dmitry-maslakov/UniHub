import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import {
  WantedCourse,
  WantedCourseRepository,
} from '../domain/wanted-course.js';

// A wanted course goes with its portal course, by the key's cascade.
@Injectable()
export class PrismaWantedCourseRepository extends WantedCourseRepository {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  async all() {
    const rows = await this.txHost.tx.wantedCourse.findMany({
      orderBy: { portalCourseId: 'asc' },
    });
    return rows.map(
      ({ portalCourseId, until }) => new WantedCourse(portalCourseId, until),
    );
  }

  // one statement, INSERT … ON CONFLICT: two at once leave one row
  async save({ portalCourseId, until }: WantedCourse) {
    await this.txHost.tx.wantedCourse.upsert({
      where: { portalCourseId },
      create: { portalCourseId, until },
      update: { until },
    });
  }

  async replace(was: WantedCourse, course: WantedCourse | null) {
    const { tx } = this.txHost;
    const where = { portalCourseId: was.portalCourseId, until: was.until };
    if (course)
      await tx.wantedCourse.updateMany({
        where,
        data: { until: course.until },
      });
    else await tx.wantedCourse.deleteMany({ where });
  }
}
