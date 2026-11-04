import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import type { CourseLink } from '../domain/course-link/course-link.js';
import { CourseLinkRepository } from '../domain/course-link/course-link.repository.js';

@Injectable()
export class PrismaCourseLinkRepository extends CourseLinkRepository {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  async save({ portalCourseId, courseId, year }: CourseLink) {
    await this.txHost.tx.courseLink.upsert({
      where: { portalCourseId },
      create: { portalCourseId, courseId, year },
      update: { courseId, year },
    });
  }

  async remove(portalCourseId: string) {
    const { count } = await this.txHost.tx.courseLink.deleteMany({
      where: { portalCourseId },
    });
    return count > 0;
  }
}
