import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';
import { CredentialRejectedError, type Credential } from '@app/plugin-sdk';
import {
  StoredText,
  type AccountLink,
  type LinkMode,
  type PortalId,
  type Secret,
} from '@app/kernel';
import { IsAdminQuery } from '../../identity/contracts.js';
import {
  AccountsChangedCommand,
  PluginCatalog,
  type PortalReaders,
} from '../../plugins/contracts.js';
import { NotLinkableError } from '../domain/errors.js';
import {
  PortalAccount,
  PortalAccountRepository,
  type AccountStatus,
} from '../domain/portal-account.js';
import { PortalLinks } from '../domain/portal-links.js';
import { Credentials } from './credentials.js';
import {
  nameOf,
  OAuthRefusedError,
  PortalUnavailableError,
  TokenRefusedError,
} from './errors.js';

// how long linking waits for the portal to say whose a token is
export const IDENTIFY_TIMEOUT_MS = 30_000;

// what the hub keeps of a connector's answer; anything else is the
// connector failing
const portalUser = z.object({
  id: StoredText.min(1).max(255),
  expiresAt: z.date().nullable(),
});

// Whose views a user reads in the portals read with users' own accounts:
// those portals, and the user's accounts in them that read now
export interface Viewing {
  portals: PortalId[];
  accounts: string[];
}

// a portal as one user sees their own link to it
export interface PortalView {
  portal: PortalId;
  mode: LinkMode;
  linked: boolean;
  status: AccountStatus | null;
  expiresAt: Date | null;
}

// Each user's own accounts of the portals that link them (PortalLinks),
// linked by a token the user pastes or by the portal's consent page
// (OAuthLinking), never read back: it's sealed for the account
// (Credentials), and only a run of the account opens it. Who it is on the
// portal comes from the portal's connector (identify), asked as the user.
// Plugins run each account that reads, and are told as accounts are linked
// and go; a consent is taken back at the portal as its account goes.
@Injectable()
export class PortalAccounts implements OnApplicationBootstrap {
  constructor(
    private readonly links: PortalLinks,
    private readonly accounts: PortalAccountRepository,
    private readonly credentials: Credentials,
    private readonly plugins: PluginCatalog,
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  // A mode no connector here takes stops the app at startup, once every
  // module has started: the plugins have been found by then. OAuth needs
  // the connector's client there too.
  onApplicationBootstrap() {
    this.links.checkAgainst((portal, mode) =>
      mode === 'oauth'
        ? !!this.plugins.oauthLinker(portal)?.oauthServer()
        : this.plugins.linker(portal, mode) !== null,
    );
  }

  // the portals the user may link an account of, and any they have one of
  async list(userId: string): Promise<PortalView[]> {
    const [admin, accounts] = await Promise.all([
      this.isAdmin(userId),
      this.accounts.ofUser(userId),
    ]);
    const theirs = new Map(accounts.map((a) => [a.portal, a]));
    const portals = new Set([...this.links.openTo(admin), ...theirs.keys()]);
    const now = new Date();
    return [...portals].sort().map((portal) => {
      const account = theirs.get(portal);
      return {
        portal,
        mode: this.links.of(portal).mode,
        linked: account !== undefined,
        status: account?.statusAt(now) ?? null,
        expiresAt: account?.expiresAt ?? null,
      };
    });
  }

  // The portals read with users' own accounts, and the user's accounts in
  // them that are linked and not past their expiry: an expired or revoked
  // one reads nothing until it's linked again, and one of a portal read as
  // shared now reads nothing either.
  async viewing(userId: string, now = new Date()): Promise<Viewing> {
    const portals = this.links.readWithAccounts();
    // every portal read as shared: no account of the user's is asked for
    if (!portals.length) return { portals, accounts: [] };
    const accounts = (await this.accounts.ofUser(userId)).filter(
      (account) =>
        portals.includes(account.portal) && account.statusAt(now) === 'linked',
    );
    return { portals, accounts: accounts.map(({ id }) => id) };
  }

  // whose views the portal's runs are: the shared account's, or those of
  // its users' own accounts that read now
  async readers(portal: PortalId, now = new Date()): Promise<PortalReaders> {
    if (this.links.of(portal).mode === 'shared') return { shared: true };
    const accounts = await this.accounts.linkedOf(portal, now);
    return { shared: false, accounts: accounts.map(({ id }) => id) };
  }

  // The credential of an account that reads now, opened for its run. One
  // whose renewal the portal refuses is revoked, and reads nothing.
  async credential(id: string, now = new Date()): Promise<Credential | null> {
    const found = await this.accounts.withCredential(id);
    if (!found) return null;
    const { account, sealed } = found;
    const reads =
      this.links.of(account.portal).mode === account.snapshot.mode &&
      account.statusAt(now) === 'linked';
    if (!reads) return null;
    try {
      return await this.credentials.open(account, sealed, now);
    } catch (error) {
      if (!(error instanceof OAuthRefusedError)) throw error;
      await this.revoked(account);
      return null;
    }
  }

  // A run found the portal no longer takes the account's credential: it's
  // revoked, unless it was only an access token run out, renewed now.
  async rejected(id: string) {
    const found = await this.accounts.withCredential(id);
    if (!found) return;
    const { account, sealed } = found;
    if (!(await this.credentials.renewed(account, sealed)))
      await this.revoked(account);
  }

  // NotLinkableError unless the user may link an account of the portal so
  async checkLinkable(userId: string, portal: PortalId, mode: AccountLink) {
    this.links.check(portal, mode, await this.isAdmin(userId));
  }

  // The user's account of the portal, linked by the token once the portal
  // takes it.
  async setToken(userId: string, portal: PortalId, token: Secret) {
    await this.checkLinkable(userId, portal, 'token');
    const user = await this.identify(portal, { kind: 'token', token });
    await this.link(userId, portal, 'token', user, token);
  }

  // The user's account of the portal, linked by `mode` as `user`: the same
  // portal user's account as before stays, another's takes its place. The
  // consent it was linked by before is taken back at the portal, the new
  // credential sealed in its place.
  async link(
    userId: string,
    portal: PortalId,
    mode: AccountLink,
    user: { id: string; expiresAt: Date | null },
    secret: Secret,
  ) {
    const had = await this.withCredential(userId, portal);
    const account = PortalAccount.link(
      had?.account ?? null,
      { userId, portal, mode },
      user,
    );
    await this.accounts.save(account, this.credentials.seal(account, secret));
    if (had) await this.credentials.revoke(had.account, had.sealed);
    const replaced =
      had && had.account.id !== account.id ? [had.account.id] : [];
    await this.changed(portal, { linked: [account.id], gone: replaced });
  }

  // the account and its credential, whatever the portal's mode is now,
  // its consent taken back at the portal first
  async unlink(userId: string, portal: PortalId) {
    const had = await this.withCredential(userId, portal);
    if (had) await this.credentials.revoke(had.account, had.sealed);
    const gone = await this.accounts.remove(userId, portal);
    if (gone) await this.changed(portal, { gone: [gone] });
  }

  // a deleted user's, all of them
  async removeAllOf(userId: string) {
    for (const account of await this.accounts.ofUser(userId)) {
      const found = await this.accounts.withCredential(account.id);
      if (found) await this.credentials.revoke(found.account, found.sealed);
    }
    for (const { id, portal } of await this.accounts.removeAllOf(userId))
      await this.changed(portal, { gone: [id] });
  }

  // Whose a credential is, as the portal's connector says, asked as the
  // user. The portal not taking it is TokenRefusedError or
  // OAuthRefusedError, as it was linked.
  async identify(portal: PortalId, credential: Credential) {
    const mode = credential.kind;
    const linker = this.plugins.linker(portal, mode);
    if (!linker) throw new NotLinkableError(portal, mode);
    let answer: unknown;
    try {
      answer = await linker.identify(
        credential,
        AbortSignal.timeout(IDENTIFY_TIMEOUT_MS),
      );
    } catch (error) {
      if (error instanceof CredentialRejectedError)
        throw mode === 'token'
          ? new TokenRefusedError()
          : new OAuthRefusedError();
      throw new PortalUnavailableError(portal, nameOf(error));
    }
    const user = portalUser.safeParse(answer);
    // without the answer, which may name the user
    if (!user.success) throw new PortalUnavailableError(portal, 'its answer');
    return user.data;
  }

  private async withCredential(userId: string, portal: PortalId) {
    const had = await this.accounts.find(userId, portal);
    return had && this.accounts.withCredential(had.id);
  }

  private async revoked(account: PortalAccount) {
    account.revoke();
    await this.accounts.saveStatus(account);
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
}
