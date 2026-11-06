import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';
import { CredentialRejectedError } from '@app/plugin-sdk';
import {
  StoredText,
  type LinkMode,
  type PortalId,
  type Secret,
} from '@app/kernel';
import { IsAdminQuery } from '../../identity/contracts.js';
import { PluginCatalog } from '../../plugins/contracts.js';
import { CredentialVault } from '../domain/credential-vault.js';
import { NotLinkableError } from '../domain/errors.js';
import {
  PortalAccount,
  PortalAccountRepository,
  type AccountStatus,
} from '../domain/portal-account.js';
import { PortalLinks } from '../domain/portal-links.js';
import { PortalUnavailableError, TokenRefusedError } from './errors.js';

// how long linking waits for the portal to say whose a token is
export const IDENTIFY_TIMEOUT_MS = 30_000;

// a plugin error's name, as a class names it; nothing else of the error
const nameOf = (error: unknown) => {
  const name = error instanceof Error ? error.name : typeof error;
  return /^[A-Za-z][\w$]{0,63}$/.test(name) ? name : 'Error';
};

// what the hub keeps of a connector's answer; anything else is the
// connector failing
const portalUser = z.object({
  id: StoredText.min(1).max(255),
  expiresAt: z.date().nullable(),
});

// a portal as one user sees their own link to it
export interface PortalView {
  portal: PortalId;
  mode: LinkMode;
  linked: boolean;
  status: AccountStatus | null;
  expiresAt: Date | null;
}

// Each user's own accounts of the portals that link them (PortalLinks),
// linked by a token the user pastes, which is never read back: it's sealed
// for the account (CredentialVault), and only a run of the account will
// open it. Who it is on the portal comes from the portal's connector
// (identify), asked as the user.
@Injectable()
export class PortalAccounts implements OnApplicationBootstrap {
  constructor(
    private readonly links: PortalLinks,
    private readonly accounts: PortalAccountRepository,
    private readonly vault: CredentialVault,
    private readonly plugins: PluginCatalog,
    private readonly queries: QueryBus,
  ) {}

  // A mode no connector here takes stops the app at startup, once every
  // module has started: the plugins have been found by then.
  onApplicationBootstrap() {
    this.links.checkAgainst(
      (portal, mode) => this.plugins.linker(portal, mode) !== null,
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
  }

  // the account and its credential, whatever the portal's mode is now
  async unlink(userId: string, portal: PortalId) {
    await this.accounts.remove(userId, portal);
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
