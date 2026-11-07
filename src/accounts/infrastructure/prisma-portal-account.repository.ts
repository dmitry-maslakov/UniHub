import { Injectable } from '@nestjs/common';
import {
  InjectTransactionHost,
  Propagation,
  Transactional,
} from '@nestjs-cls/transactional';
import { NO_INSTANCE, type Instance, type PortalId } from '@app/kernel';
import type { PortalAccount as Row } from '../../generated/prisma/client.js';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import {
  PortalAccount,
  PortalAccountRepository,
  type PortalAccountState,
} from '../domain/portal-account.js';

// the columns are the state's; their values were the domain's when written
const toAccount = (row: Row) =>
  PortalAccount.restore({
    ...row,
    instance: row.instance as Instance,
  } as PortalAccountState);

// Credentials go with their accounts by the foreign key's cascade, in the
// same statement.
@Injectable()
export class PrismaPortalAccountRepository extends PortalAccountRepository {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  async find(userId: string, portal: PortalId) {
    const row = await this.txHost.tx.portalAccount.findUnique({
      where: { userId_portal: { userId, portal } },
    });
    return row && toAccount(row);
  }

  async ofUser(userId: string) {
    const rows = await this.txHost.tx.portalAccount.findMany({
      where: { userId },
      orderBy: { portal: 'asc' },
    });
    return rows.map(toAccount);
  }

  async linkedOf(portal: PortalId, now: Date) {
    const rows = await this.txHost.tx.portalAccount.findMany({
      where: {
        portal,
        status: 'linked',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { id: 'asc' },
    });
    return rows.map(toAccount);
  }

  async withCredential(id: string) {
    const row = await this.txHost.tx.portalAccount.findUnique({
      where: { id },
      include: { credential: { select: { sealed: true } } },
    });
    if (!row?.credential) return null;
    const { credential, ...account } = row;
    return { account: toAccount(account), sealed: credential.sealed };
  }

  async saveStatus(account: PortalAccount, sealed: string) {
    const { id, status } = account.snapshot;
    await this.txHost.tx.portalAccount.updateMany({
      where: { id, credential: { is: { sealed } } },
      data: { status },
    });
  }

  // One upsert per (user, portal), so two at once leave one account: a new
  // account's id takes the old one's place, its credential carried along by
  // the key (ON UPDATE CASCADE), then given the new seal.
  @Transactional()
  async save(account: PortalAccount, sealed: string) {
    const { id, userId, portal, ...fields } = account.snapshot;
    await this.txHost.tx.portalAccount.upsert({
      where: { userId_portal: { userId, portal } },
      create: { id, userId, portal, ...fields },
      update: { id, ...fields },
    });
    await this.txHost.tx.portalCredential.upsert({
      where: { accountId: id },
      create: { accountId: id, sealed },
      update: { sealed },
    });
  }

  // in the transaction of whoever asks, beside the records' own
  @Transactional(Propagation.Mandatory)
  async adopt(portal: PortalId, instance: Instance) {
    const { count } = await this.txHost.tx.portalAccount.updateMany({
      where: { portal, instance: NO_INSTANCE },
      data: { instance },
    });
    return count;
  }

  async remove(userId: string, portal: PortalId) {
    const [gone] = await this.removeWhere({ userId, portal });
    return gone?.id ?? null;
  }

  removeAllOf(userId: string) {
    return this.removeWhere({ userId });
  }

  // which went: Prisma's deleteMany answers a count alone. By their ids,
  // so one linked anew meanwhile, another account, stays
  @Transactional()
  private async removeWhere(where: { userId: string; portal?: PortalId }) {
    const { tx } = this.txHost;
    const rows = await tx.portalAccount.findMany({
      where,
      select: { id: true, portal: true },
    });
    await tx.portalAccount.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    return rows.map(({ id, portal }) => ({ id, portal: portal as PortalId }));
  }
}
