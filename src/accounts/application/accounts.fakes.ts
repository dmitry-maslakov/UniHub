import type { OAuthServer } from '@app/plugin-sdk';
import { Secret, type PortalId } from '@app/kernel';
import { CredentialVault, type SealedFor } from '../domain/credential-vault.js';
import { UnreadableCredentialError } from '../domain/errors.js';
import {
  PortalAccount,
  PortalAccountRepository,
  type PortalAccountState,
} from '../domain/portal-account.js';
import { OAuthRefusedError } from './errors.js';
import { ConsentStates, OAuthClient, type PendingConsent } from './oauth.js';

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

  async saveStatus(account: PortalAccount) {
    const { userId, portal, status } = account.snapshot;
    const row = this.rows.get(`${userId}:${portal}`);
    if (row?.account.id === account.id)
      row.account = { ...row.account, status };
  }

  async reseal(account: PortalAccount, sealed: string) {
    const { userId, portal } = account.snapshot;
    const row = this.rows.get(`${userId}:${portal}`);
    if (row?.account.id === account.id) row.sealed = sealed;
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

// A portal's OAuth server: consents by a counter, a code per consent that
// gives "access-<n>" and "refresh-<n>" for an hour, refresh tokens renewed
// to "access-<n>.<renewals>"; refusing whatever `refuses` names
export class FakeOAuthClient extends OAuthClient {
  consents = 0;
  renewals = 0;
  readonly refuses = new Set<'code' | 'refresh'>();
  // the portal away
  away = false;
  readonly exchanged: { answer: URLSearchParams; verifier: string }[] = [];

  async consent(server: OAuthServer, redirectUri: string) {
    const n = ++this.consents;
    const url = new URL(server.authorizationEndpoint);
    url.search = new URLSearchParams({
      redirect_uri: redirectUri,
      state: `state-${n}`,
    }).toString();
    return { url, state: `state-${n}`, verifier: `verifier-${n}` };
  }

  async exchange(
    _: OAuthServer,
    __: string,
    answer: URLSearchParams,
    { state, verifier }: { state: string; verifier: string },
  ) {
    if (this.away) throw new Error('ECONNREFUSED');
    if (answer.get('state') !== state || this.refuses.has('code'))
      throw new OAuthRefusedError();
    this.exchanged.push({ answer, verifier });
    const n = answer.get('code');
    return this.tokens(`access-${n}`, `refresh-${n}`);
  }

  async refresh(_: OAuthServer, refreshToken: Secret) {
    if (this.refuses.has('refresh')) throw new OAuthRefusedError();
    this.renewals++;
    const n = refreshToken.reveal().replace('refresh-', '');
    return {
      ...this.tokens(`access-${n}.${this.renewals}`),
      refreshToken: null,
    };
  }

  private tokens(access: string, refresh?: string) {
    return {
      accessToken: new Secret(access),
      refreshToken: refresh ? new Secret(refresh) : null,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    };
  }
}

// consents on their way, taken once
export class InMemoryConsents extends ConsentStates {
  readonly pending = new Map<string, PendingConsent>();

  async put(state: string, pending: PendingConsent) {
    this.pending.set(state, pending);
  }

  async take(state: string) {
    const pending = this.pending.get(state) ?? null;
    this.pending.delete(state);
    return pending;
  }
}
