import type { PortalId, Secret } from '@app/kernel';
import { CredentialVault } from '../domain/credential-vault.js';
import { UnreadableCredentialError } from '../domain/errors.js';
import {
  PortalAccount,
  PortalAccountRepository,
  type PortalAccountState,
} from '../domain/portal-account.js';

// In-memory ports for the application's unit tests.

// each user's accounts by "user:portal", as last saved, with what sealed
// their credential
export class InMemoryAccounts extends PortalAccountRepository {
  readonly rows = new Map<
    string,
    { account: PortalAccountState; sealed: string }
  >();

  async find(userId: string, portal: PortalId) {
    const row = this.rows.get(`${userId}:${portal}`);
    return row ? PortalAccount.restore(row.account) : null;
  }

  async ofUser(userId: string) {
    return [...this.rows.values()]
      .filter(({ account }) => account.userId === userId)
      .map(({ account }) => PortalAccount.restore(account));
  }

  async save(account: PortalAccount, sealed: string) {
    const state = account.snapshot;
    this.rows.set(`${state.userId}:${state.portal}`, {
      account: state,
      sealed,
    });
  }

  async remove(userId: string, portal: PortalId) {
    return this.rows.delete(`${userId}:${portal}`);
  }

  async removeAllOf(userId: string) {
    for (const [key, { account }] of this.rows)
      if (account.userId === userId) this.rows.delete(key);
  }
}

// seals as "sealed-<n>", keeping what each was, for its account only
export class FakeVault extends CredentialVault {
  private readonly kept: { credential: Secret; accountId: string }[] = [];

  seal(credential: Secret, accountId: string) {
    this.kept.push({ credential, accountId });
    return `sealed-${this.kept.length - 1}`;
  }

  open(sealed: string, accountId: string) {
    const kept = this.kept[Number(sealed.slice('sealed-'.length))];
    if (kept?.accountId !== accountId) throw new UnreadableCredentialError();
    return kept.credential;
  }
}
