import { createHash } from 'node:crypto';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';
import {
  CredentialRejectedError,
  TokensNotAllowedError as SiteTakesNoTokens,
  type Credential,
} from '@app/plugin-sdk';
import {
  NO_INSTANCE,
  StoredText,
  type Instance,
  type LinkMode,
  type PortalId,
} from '@app/kernel';
import { ViewsShownQuery } from '../../catalog/contracts.js';
import { IsAdminQuery } from '../../identity/contracts.js';
import {
  AccountsChangedCommand,
  PluginCatalog,
  type AccountCredential,
  type PortalReaders,
} from '../../plugins/contracts.js';
import {
  CredentialVault,
  type SealedCredential,
} from '../domain/credential-vault.js';
import { NotLinkableError } from '../domain/errors.js';
import {
  PortalAccount,
  PortalAccountRepository,
  type AccountStatus,
} from '../domain/portal-account.js';
import { PortalLinks } from '../domain/portal-links.js';
import {
  PortalUnreachableError,
  SiteNeededError,
  SiteNotTakenError,
  TokenRefusedError,
  TokensNotAllowedError,
} from './errors.js';
import { HiddenCourses } from './hidden-courses.js';
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

// what a connector gets: the site's address only for a portal of sites
const credentialOf = ({ token, url }: SealedCredential): Credential => ({
  kind: 'token',
  token,
  ...(url && { url }),
});

// what the hub keeps of a connector's answer; anything else is the
// connector failing
const portalUser = z.object({
  id: StoredText.min(1).max(255),
  expiresAt: z.date().nullable(),
});

// Whose views a user reads in the portals not read as shared: those read
// with users' own accounts, and the user's accounts in them that read now;
// the public ones, read whole, and the courses of them the user picked;
// and of all they read, the portal courses they hide
export interface Viewing {
  portals: PortalId[];
  accounts: string[];
  picks: Picks;
  hidden: string[];
}

// a portal as one user sees their own link to it, or their picks of it
export interface PortalView {
  portal: PortalId;
  // the name it goes by (PORTAL_LABELS)
  label: string;
  mode: LinkMode;
  linked: boolean;
  // the site the user's account was linked with, null when not linked or
  // the portal is one site
  instance: Instance | null;
  status: AccountStatus | null;
  expiresAt: Date | null;
  // of a public portal's catalog; null for any other portal
  picked: number | null;
  // the user's own account of it reads and has had no pass shown since it
  // was linked: its first run is reading it. No counts or times, which
  // could tell how long a pass took
  firstSync: boolean;
}

// Each user's own accounts of the portals that link them (PortalLinks),
// linked by a token the user pastes, which is never read back: it's sealed
// for the account (CredentialVault), with the address of the portal's site
// it's of when the portal is a site per school, and only a run of the
// account opens it. Who it is on the portal comes from the portal's
// connector (identify), asked as the user. Plugins run each account that
// reads, and are told as accounts are linked and go.
@Injectable()
export class PortalAccounts implements OnApplicationBootstrap {
  constructor(
    private readonly links: PortalLinks,
    private readonly accounts: PortalAccountRepository,
    private readonly vault: CredentialVault,
    private readonly plugins: PluginCatalog,
    private readonly picks: PortalPicks,
    private readonly hidden: HiddenCourses,
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  // A mode no connector here takes stops the app at startup, once every
  // module has started: the plugins have been found by then. Public takes
  // a connector over gRPC, which asks which courses are wanted (Wanted), or
  // a poll connector here that sends its whole catalog (catalog: true).
  onApplicationBootstrap() {
    this.links.checkAgainst((portal, mode) =>
      mode === 'public'
        ? this.plugins.publishes(portal)
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
    const reading = accounts.filter((a) => this.reads(a, now));
    const shown = new Set(
      reading.length
        ? await this.queries.execute(
            new ViewsShownQuery(
              reading.map(({ id }) => id),
              now,
            ),
          )
        : [],
    );
    return [...portals].sort().map((portal) => {
      const { mode } = this.links.of(portal);
      // a public portal links no account, whatever one is left of before
      const account = mode === 'public' ? undefined : theirs.get(portal);
      return {
        portal,
        label: this.links.label(portal),
        mode,
        linked: account !== undefined,
        instance: account?.instance || null,
        status: account?.statusAt(now) ?? null,
        expiresAt: account?.expiresAt ?? null,
        picked: picked.get(portal) ?? null,
        firstSync:
          account !== undefined &&
          this.reads(account, now) &&
          !shown.has(account.id),
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
    const [accounts, picks, hidden] = await Promise.all([
      // none read with accounts: no account of the user's is asked for
      portals.length ? this.accounts.ofUser(userId) : [],
      this.picks.of(userId),
      this.hidden.of(userId),
    ]);
    const reading = accounts.filter(
      (account) =>
        portals.includes(account.portal) && account.statusAt(now) === 'linked',
    );
    return {
      portals,
      accounts: reading.map(({ id }) => id),
      picks,
      hidden,
    };
  }

  // whose views the portal's runs are: those of its users' own accounts
  // that read now, of a portal read with them; else the shared account's
  async readers(portal: PortalId, now = new Date()): Promise<PortalReaders> {
    if (this.links.of(portal).mode !== 'token') return { shared: true };
    const accounts = await this.accounts.linkedOf(portal, now);
    return { shared: false, accounts: accounts.map(({ id }) => id) };
  }

  // The credential of an account that reads now, opened for its run, which
  // seal of it that is, and the site the account reads. One sealed before
  // credentials kept their site goes to the site its account was given
  // (InstanceAdoption), the one its records are stamped with, whatever the
  // portal's settings say since.
  async credential(
    id: string,
    now = new Date(),
  ): Promise<AccountCredential | null> {
    const found = await this.accounts.withCredential(id);
    if (!found) return null;
    const { account, sealed } = found;
    if (!this.reads(account, now)) return null;
    const opened = this.vault.open(sealed, account.snapshot);
    return {
      credential: credentialOf({
        ...opened,
        url: opened.url ?? (account.instance || null),
      }),
      seal: sealOf(sealed),
      instance: account.instance,
    };
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
  // takes it, of the site at `url` for a portal that is a site per school:
  // the same portal user's account of the same site as before stays, any
  // other takes its place.
  async setToken(userId: string, portal: PortalId, given: SealedCredential) {
    this.links.check(portal, 'token', await this.isAdmin(userId));
    const sites = this.plugins.hasInstances(portal);
    if (sites && !given.url) throw new SiteNeededError(portal);
    if (!sites && given.url) throw new SiteNotTakenError(portal);
    const user = await this.identify(portal, credentialOf(given));
    const had = await this.accounts.find(userId, portal);
    const instance = given.url ?? NO_INSTANCE;
    const account = PortalAccount.link(
      had,
      { userId, portal, instance, mode: 'token' },
      user,
    );
    await this.accounts.save(account, this.vault.seal(given, account.snapshot));
    const replaced = had && had.id !== account.id ? [had.id] : [];
    await this.changed(portal, { linked: [account.id], gone: replaced });
  }

  // the account and its credential, whatever the portal's mode is now
  async unlink(userId: string, portal: PortalId) {
    const gone = await this.accounts.remove(userId, portal);
    if (gone) await this.changed(portal, { gone: [gone] });
  }

  // a deleted user's, all of them, their picks, and what they hid
  async removeAllOf(userId: string) {
    await this.picks.removeAllOf(userId);
    await this.hidden.removeAllOf(userId);
    for (const { id, portal } of await this.accounts.removeAllOf(userId))
      await this.changed(portal, { gone: [id] });
  }

  // the account is run now: linked in the mode its portal links by, and
  // neither expired nor revoked
  private reads(account: PortalAccount, now: Date) {
    return (
      this.links.of(account.portal).mode === account.snapshot.mode &&
      account.statusAt(now) === 'linked'
    );
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

  // the portal links accounts here: checked by links.check() before
  private async identify(portal: PortalId, credential: Credential) {
    const linker = this.plugins.linker(portal, 'token');
    if (!linker) throw new NotLinkableError(portal, 'token');
    let answer: unknown;
    try {
      answer = await linker.identify(
        credential,
        AbortSignal.timeout(IDENTIFY_TIMEOUT_MS),
      );
    } catch (error) {
      if (error instanceof CredentialRejectedError)
        throw new TokenRefusedError();
      if (error instanceof SiteTakesNoTokens) throw new TokensNotAllowedError();
      throw new PortalUnreachableError(portal, nameOf(error));
    }
    const user = portalUser.safeParse(answer);
    // without the answer, which may name the user
    if (!user.success) throw new PortalUnreachableError(portal, 'its answer');
    return user.data;
  }

  // the portal's accounts kept with no site are this one's
  adopt(portal: PortalId, instance: Instance) {
    return this.accounts.adopt(portal, instance);
  }
}
