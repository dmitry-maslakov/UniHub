import { createHash } from 'node:crypto';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';
import { CredentialRejectedError } from '@app/plugin-sdk';
import {
  StoredText,
  type LinkMode,
  type PortalId,
  type Secret,
} from '@app/kernel';
import { IsAdminQuery } from '../../identity/contracts.js';
import {
  AccountsChangedCommand,
  PluginCatalog,
  type AccountCredential,
  type PortalReaders,
} from '../../plugins/contracts.js';
import { CredentialVault } from '../domain/credential-vault.js';
import { NotLinkableError } from '../domain/errors.js';
import {
  PortalAccount,
  PortalAccountRepository,
  type AccountStatus,
} from '../domain/portal-account.js';
import { PortalLinks } from '../domain/portal-links.js';
import { PortalUnavailableError, TokenRefusedError } from './errors.js';
import { PortalPicks, type Picks } from './portal-picks.js';

// how long linking waits for the portal to say whose a token is
export const IDENTIFY_TIMEOUT_MS = 30_000;

// a plugin error's name, as a class names it; nothing else of the error
const nameOf = (error: unknown) => {
  const name = error instanceof Error ? error.name : typeof error;
  return /^[A-Za-z][\w$]{0,63}$/.test(name) ? name : 'Error';
};

// Which seal of an account's credential a run had, and nothing of the
// credential: a hash of what's sealed, new each time it's sealed (a fresh
// nonce), so a link again by the same token is another
const sealOf = (sealed: string) =>
  createHash('sha256').update(sealed).digest('base64url');

// what the hub keeps of a connector's answer; anything else is the
// connector failing
const portalUser = z.object({
  id: StoredText.min(1).max(255),
  expiresAt: z.date().nullable(),
});

// Whose views a user reads in the portals not read as shared: those read
// with users' own accounts, and the user's accounts in them that read now;
// the public ones, and the courses the user picked
export interface Viewing {
  portals: PortalId[];
  accounts: string[];
  picks: Picks;
}

// a portal as one user sees their own link to it, or their picks of it
export interface PortalView {
  portal: PortalId;
  label: string;
  mode: LinkMode;
  linked: boolean;
  status: AccountStatus | null;
  expiresAt: Date | null;
  // of a public portal's catalog; null for any other portal
  picked: number | null;
}

// Each user's own accounts of the portals that link them (PortalLinks),
// linked by a token the user pastes, which is never read back: it's sealed
// for the account (CredentialVault), and only a run of the account opens
// it. Who it is on the portal comes from the portal's connector
// (identify), asked as the user. Plugins run each account that reads, and
// are told as accounts are linked and go.
@Injectable()
export class PortalAccounts implements OnApplicationBootstrap {
  constructor(
    private readonly links: PortalLinks,
    private readonly accounts: PortalAccountRepository,
    private readonly vault: CredentialVault,
    private readonly plugins: PluginCatalog,
    private readonly picks: PortalPicks,
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  // A mode no connector here takes stops the app at startup, once every
  // module has started: the plugins have been found by then. Public takes
  // a connector over gRPC, which asks which courses are wanted (Wanted).
  onApplicationBootstrap() {
    this.links.checkAgainst((portal, mode) =>
      mode === 'public'
        ? this.plugins.external(portal)
        : this.plugins.linker(portal, mode) !== null,
    );
  }

  // the portals the user may link an account of or pick courses from, and
  // any they have an account of
  async list(userId: string): Promise<PortalView[]> {
    const [admin, accounts, picked] = await Promise.all([
      this.isAdmin(userId),
      this.accounts.ofUser(userId),
      this.picks.counts(userId),
    ]);
    const theirs = new Map(accounts.map((a) => [a.portal, a]));
    const portals = new Set([...this.links.openTo(admin), ...theirs.keys()]);
    const now = new Date();
    return [...portals].sort().map((portal) => {
      const { mode } = this.links.of(portal);
      // a public portal links no account, whatever one is left of before
      const account = mode === 'public' ? undefined : theirs.get(portal);
      return {
        portal,
        label: this.links.label(portal),
        mode,
        linked: account !== undefined,
        status: account?.statusAt(now) ?? null,
        expiresAt: account?.expiresAt ?? null,
        picked: picked.get(portal) ?? null,
      };
    });
  }

  // The portals read with users' own accounts, and the user's accounts in
  // them that are linked and not past their expiry: an expired or revoked
  // one reads nothing until it's linked again, and one of a portal read as
  // shared now reads nothing either. The public portals, and the user's
  // picks.
  async viewing(userId: string, now = new Date()): Promise<Viewing> {
    const portals = this.links.readWithAccounts();
    const [accounts, picks] = await Promise.all([
      // none read with accounts: no account of the user's is asked for
      portals.length ? this.accounts.ofUser(userId) : [],
      this.picks.of(userId),
    ]);
    const reading = accounts.filter(
      (account) =>
        portals.includes(account.portal) && account.statusAt(now) === 'linked',
    );
    return { portals, accounts: reading.map(({ id }) => id), picks };
  }

  // whose views the portal's runs are: those of its users' own accounts
  // that read now, of a portal read with them; else the shared account's
  async readers(portal: PortalId, now = new Date()): Promise<PortalReaders> {
    if (this.links.of(portal).mode !== 'token') return { shared: true };
    const accounts = await this.accounts.linkedOf(portal, now);
    return { shared: false, accounts: accounts.map(({ id }) => id) };
  }

  // The credential of an account that reads now, opened for its run, and
  // which seal of it that is
  async credential(
    id: string,
    now = new Date(),
  ): Promise<AccountCredential | null> {
    const found = await this.accounts.withCredential(id);
    if (!found) return null;
    const { account, sealed } = found;
    const reads =
      this.links.of(account.portal).mode === account.snapshot.mode &&
      account.statusAt(now) === 'linked';
    if (!reads) return null;
    const token = this.vault.open(sealed, account.snapshot);
    return { credential: { kind: 'token', token }, seal: sealOf(sealed) };
  }

  // A run found the portal no longer takes the account's credential of
  // `seal`: revoked, unless it was linked again since by another one
  async rejected(id: string, seal: string) {
    const found = await this.accounts.withCredential(id);
    if (!found || sealOf(found.sealed) !== seal) return;
    found.account.revoke();
    await this.accounts.saveStatus(found.account, found.sealed);
  }

  // The user's account of the portal, linked by the token once the portal
  // takes it: the same portal user's account as before stays, another's
  // takes its place.
  async setToken(userId: string, portal: PortalId, token: Secret) {
    this.links.check(portal, 'token', await this.isAdmin(userId));
    const user = await this.identify(portal, token);
    const had = await this.accounts.find(userId, portal);
    const account = PortalAccount.link(
      had,
      { userId, portal, mode: 'token' },
      user,
    );
    await this.accounts.save(account, this.vault.seal(token, account.snapshot));
    const replaced = had && had.id !== account.id ? [had.id] : [];
    await this.changed(portal, { linked: [account.id], gone: replaced });
  }

  // the account and its credential, whatever the portal's mode is now
  async unlink(userId: string, portal: PortalId) {
    const gone = await this.accounts.remove(userId, portal);
    if (gone) await this.changed(portal, { gone: [gone] });
  }

  // a deleted user's, all of them, and their picks
  async removeAllOf(userId: string) {
    await this.picks.removeAllOf(userId);
    for (const { id, portal } of await this.accounts.removeAllOf(userId))
      await this.changed(portal, { gone: [id] });
  }

  private changed(
    portal: PortalId,
    change: { linked?: string[]; gone?: string[] },
  ) {
    return this.commands.execute(new AccountsChangedCommand(portal, change));
  }

  private isAdmin(userId: string) {
    return this.queries.execute(new IsAdminQuery(userId));
  }

  private async identify(portal: PortalId, token: Secret) {
    const linker = this.plugins.linker(portal, 'token');
    if (!linker) throw new NotLinkableError(portal, 'token');
    let answer: unknown;
    try {
      answer = await linker.identify(
        { kind: 'token', token },
        AbortSignal.timeout(IDENTIFY_TIMEOUT_MS),
      );
    } catch (error) {
      if (error instanceof CredentialRejectedError)
        throw new TokenRefusedError();
      throw new PortalUnavailableError(portal, nameOf(error));
    }
    const user = portalUser.safeParse(answer);
    // without the answer, which may name the user
    if (!user.success) throw new PortalUnavailableError(portal, 'its answer');
    return user.data;
  }
}
