import { Injectable, Logger } from '@nestjs/common';
import type { Credential } from '@app/plugin-sdk';
import type { PortalId, Secret } from '@app/kernel';
import { PluginCatalog } from '../../plugins/contracts.js';
import { CredentialVault } from '../domain/credential-vault.js';
import { NotLinkableError } from '../domain/errors.js';
import { dueAt, grantOf, grantToSecret } from '../domain/oauth-grant.js';
import {
  PortalAccountRepository,
  type PortalAccount,
} from '../domain/portal-account.js';
import { nameOf } from './errors.js';
import { OAuthClient } from './oauth.js';

// how long the portal is given to take a credential back
export const REVOKE_TIMEOUT_MS = 30_000;

// Each account's credential as the vault keeps it: a pasted token as it
// is, what a consent gave as one grant (oauth-grant.ts). Opened for a run,
// its access token renewed first when it runs out soon, and taken back at
// the portal when the account goes.
@Injectable()
export class Credentials {
  private readonly logger = new Logger(Credentials.name);

  constructor(
    private readonly vault: CredentialVault,
    private readonly accounts: PortalAccountRepository,
    private readonly plugins: PluginCatalog,
    private readonly oauth: OAuthClient,
  ) {}

  seal(account: PortalAccount, secret: Secret) {
    return this.vault.seal(secret, account.snapshot);
  }

  // OAuthRefusedError when the portal refuses the renewal; the renewed
  // grant saved, unless the account is going (`keep` false)
  async open(
    account: PortalAccount,
    sealed: string,
    now = new Date(),
    keep = true,
  ): Promise<Credential> {
    const secret = this.vault.open(sealed, account.snapshot);
    if (account.snapshot.mode === 'token')
      return { kind: 'token', token: secret };
    const grant = grantOf(secret);
    const current = dueAt(grant, now)
      ? await this.renew(account, grant, keep)
      : grant;
    return { kind: 'oauth', accessToken: current.accessToken };
  }

  // Whether a credential a run found refused was only an access token run
  // out: renewed now, whenever it was due. False for a pasted token, or
  // a renewal the portal refuses too.
  async renewed(account: PortalAccount, sealed: string) {
    if (account.snapshot.mode !== 'oauth') return false;
    const grant = grantOf(this.vault.open(sealed, account.snapshot));
    if (!grant.refreshToken) return false;
    return this.renew(account, grant).then(
      () => true,
      () => false,
    );
  }

  // Takes an account's consent back at the portal before it goes, the
  // portal's own way (its connector's revoke): as best it can, a failure
  // logged by its name alone. A pasted token is the user's to revoke.
  async revoke(account: PortalAccount, sealed: string) {
    if (account.snapshot.mode !== 'oauth') return;
    const linker = this.plugins.oauthLinker(account.portal);
    try {
      if (!linker) throw new NotLinkableError(account.portal, 'oauth');
      await linker.revoke(
        await this.open(account, sealed, new Date(), false),
        AbortSignal.timeout(REVOKE_TIMEOUT_MS),
      );
    } catch (error) {
      this.logger.warn(
        `an account of ${account.portal} was not revoked there: ${nameOf(error)}`,
      );
    }
  }

  // the portal's server, and the hub's client there
  server(portal: PortalId) {
    const server = this.plugins.oauthLinker(portal)?.oauthServer();
    if (!server) throw new NotLinkableError(portal, 'oauth');
    return server;
  }

  private async renew(
    account: PortalAccount,
    grant: ReturnType<typeof grantOf>,
    keep = true,
  ) {
    const tokens = await this.oauth.refresh(
      this.server(account.portal),
      grant.refreshToken!,
    );
    // a portal that gives no new refresh token keeps the one it gave
    const renewed = {
      ...tokens,
      refreshToken: tokens.refreshToken ?? grant.refreshToken,
    };
    if (keep)
      await this.accounts.reseal(
        account,
        this.seal(account, grantToSecret(renewed)),
      );
    return renewed;
  }
}
