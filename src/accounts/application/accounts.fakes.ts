import type { PortalId, Secret } from '@app/kernel';
import { CredentialVault, type SealedFor } from '../domain/credential-vault.js';
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

  async linkedOf(portal: PortalId, now: Date) {
    return [...this.rows.values()]
      .map(({ account }) => PortalAccount.restore(account))
      .filter((a) => a.portal === portal && a.statusAt(now) === 'linked');
  }

  async withCredential(id: string) {
    const row = [...this.rows.values()].find((r) => r.account.id === id);
    return row
      ? { account: PortalAccount.restore(row.account), sealed: row.sealed }
      : null;
  }

  async saveStatus(account: PortalAccount, sealed: string) {
    const { userId, portal, status } = account.snapshot;
    const row = this.rows.get(`${userId}:${portal}`);
    if (row?.account.id === account.id && row.sealed === sealed)
      row.account = { ...row.account, status };
  }

  async save(account: PortalAccount, sealed: string) {
    const state = account.snapshot;
    this.rows.set(`${state.userId}:${state.portal}`, {
      account: state,
      sealed,
    });
  }

  async remove(userId: string, portal: PortalId) {
    const key = `${userId}:${portal}`;
    const id = this.rows.get(key)?.account.id ?? null;
    this.rows.delete(key);
    return id;
  }

  async removeAllOf(userId: string) {
    const removed: { id: string; portal: PortalId }[] = [];
    for (const [key, { account }] of this.rows)
      if (account.userId === userId) {
        removed.push({ id: account.id, portal: account.portal });
        this.rows.delete(key);
      }
    return removed;
  }
}

// what a sealed credential is bound to, as one key
const key = ({ id, userId, portal }: SealedFor) => `${id}:${userId}:${portal}`;

// seals as "sealed-<n>", keeping what each was, for its account only
export class FakeVault extends CredentialVault {
  private readonly kept: { credential: Secret; boundTo: string }[] = [];

  seal(credential: Secret, account: SealedFor) {
    this.kept.push({ credential, boundTo: key(account) });
    return `sealed-${this.kept.length - 1}`;
  }

  open(sealed: string, account: SealedFor) {
    const kept = this.kept[Number(sealed.slice('sealed-'.length))];
    if (kept?.boundTo !== key(account)) throw new UnreadableCredentialError();
    return kept.credential;
  }
}
