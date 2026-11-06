import { Injectable } from '@nestjs/common';
import {
  InjectTransactionHost,
  Transactional,
} from '@nestjs-cls/transactional';
import type { PortalId } from '@app/kernel';
import type { PortalAccount as Row } from '../../generated/prisma/client.js';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import {
  PortalAccount,
  PortalAccountRepository,
  type PortalAccountState,
} from '../domain/portal-account.js';

// the columns are the state's; their values were the domain's when written
const toAccount = (row: Row) =>
  PortalAccount.restore(row as PortalAccountState);

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

  async remove(userId: string, portal: PortalId) {
    const { count } = await this.txHost.tx.portalAccount.deleteMany({
      where: { userId, portal },
    });
    return count > 0;
  }

  async removeAllOf(userId: string) {
    await this.txHost.tx.portalAccount.deleteMany({ where: { userId } });
  }
}
