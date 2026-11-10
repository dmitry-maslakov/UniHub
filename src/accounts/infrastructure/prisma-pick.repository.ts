import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import { PickRepository } from '../domain/picks.js';

@Injectable()
export class PrismaPickRepository extends PickRepository {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  async ofUser(userId: string) {
    const rows = await this.txHost.tx.pick.findMany({
      where: { userId },
      select: { portalCourseId: true },
      orderBy: { portalCourseId: 'asc' },
    });
    return rows.map(({ portalCourseId }) => portalCourseId);
  }

  async ofUserWithInto(userId: string) {
    const rows = await this.txHost.tx.pick.findMany({
      where: { userId },
      select: { portalCourseId: true, into: true },
      orderBy: { portalCourseId: 'asc' },
    });
    return {
      courses: rows.map(({ portalCourseId }) => portalCourseId),
      into: new Map(
        rows.flatMap(({ portalCourseId, into }) =>
          into === null ? [] : [[portalCourseId, into] as const],
        ),
      ),
    };
  }

  async add(userId: string, portalCourseId: string) {
    await this.txHost.tx.pick.createMany({
      data: { userId, portalCourseId },
      skipDuplicates: true,
    });
  }

  async showWith(userId: string, portalCourseId: string, into: string | null) {
    await this.txHost.tx.pick.update({
      where: { userId_portalCourseId: { userId, portalCourseId } },
      data: { into },
    });
  }

  async remove(userId: string, portalCourseId: string) {
    await this.txHost.tx.pick.deleteMany({ where: { userId, portalCourseId } });
  }

  async removeAllOf(userId: string) {
    await this.txHost.tx.pick.deleteMany({ where: { userId } });
  }
}
