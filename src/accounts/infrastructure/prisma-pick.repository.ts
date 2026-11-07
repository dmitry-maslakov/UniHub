import { Injectable } from '@nestjs/common';
import {
  InjectTransactionHost,
  Propagation,
  Transactional,
} from '@nestjs-cls/transactional';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import { PickRepository } from '../domain/picks.js';

// the advisory locks' class of a user's picks, apart from catalog's (1 to 3)
const PICKS_LOCK = 100;

// A user's picks go with the user and with the portal course, by the keys'
// cascades.
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

  // Two picks of one user's at once would both count the same picks and
  // both find room for one more. An advisory lock on the user serialises
  // them until the transaction ends, which a row lock can't do for picks
  // not made yet. Only in a transaction: without one, the lock would end
  // with the statement.
  @Transactional(Propagation.Mandatory)
  async lockOf(userId: string) {
    await this.txHost.tx
      .$executeRaw`SELECT pg_advisory_xact_lock(${PICKS_LOCK}::int, hashtext(${userId}))`;
    return this.ofUser(userId);
  }

  async add(userId: string, portalCourseId: string) {
    await this.txHost.tx.pick.createMany({
      data: { userId, portalCourseId },
      skipDuplicates: true,
    });
  }

  @Transactional()
  async remove(userId: string, portalCourseId: string) {
    const { tx } = this.txHost;
    const { count } = await tx.pick.deleteMany({
      where: { userId, portalCourseId },
    });
    return count ? tx.pick.count({ where: { portalCourseId } }) : null;
  }

  async picked() {
    const rows = await this.txHost.tx.pick.findMany({
      distinct: ['portalCourseId'],
      select: { portalCourseId: true },
    });
    return rows.map(({ portalCourseId }) => portalCourseId);
  }
}
