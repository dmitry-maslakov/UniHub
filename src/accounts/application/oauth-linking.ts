import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { PortalId } from '@app/kernel';
import { accountsConfig } from '../accounts.config.js';
import { grantToSecret } from '../domain/oauth-grant.js';
import { Credentials } from './credentials.js';
import {
  ConsentUnknownError,
  nameOf,
  OAuthRefusedError,
  PortalUnavailableError,
} from './errors.js';
import { ConsentStates, OAuthClient } from './oauth.js';
import { PortalAccounts } from './portal-accounts.js';

// Linking by the portal's consent page (README, Portal accounts): the user
// is sent there with a state and a PKCE challenge, kept for a few minutes
// and taken once; the portal sends them back with a code, which the hub
// trades for tokens, then asks the portal whose they are and links the
// account as a pasted token does.
@Injectable()
export class OAuthLinking {
  constructor(
    private readonly accounts: PortalAccounts,
    private readonly credentials: Credentials,
    private readonly oauth: OAuthClient,
    private readonly consents: ConsentStates,
    @Inject(accountsConfig.KEY)
    private readonly config: ConfigType<typeof accountsConfig>,
  ) {}

  // where the portal sends the user back
  redirectUri(portal: PortalId) {
    return new URL(
      `/api/me/portals/${portal}/oauth/callback`,
      this.config.publicUrl,
    ).href;
  }

  // the portal's consent page to send the user to
  async start(userId: string, portal: PortalId) {
    await this.accounts.checkLinkable(userId, portal, 'oauth');
    const consent = await this.oauth.consent(
      this.credentials.server(portal),
      this.redirectUri(portal),
    );
    await this.consents.put(consent.state, {
      userId,
      portal,
      verifier: consent.verifier,
    });
    return consent.url;
  }

  // The portal's answer (the callback's query), the user's own consent on
  // its way: the account linked by the tokens its code gives.
  async finish(userId: string, portal: PortalId, answer: URLSearchParams) {
    const state = answer.get('state');
    const pending = state ? await this.consents.take(state) : null;
    if (!state || pending?.userId !== userId || pending.portal !== portal)
      throw new ConsentUnknownError();
    await this.accounts.checkLinkable(userId, portal, 'oauth');
    const tokens = await this.oauth
      .exchange(
        this.credentials.server(portal),
        this.redirectUri(portal),
        answer,
        { state, verifier: pending.verifier },
      )
      .catch((error: unknown) => {
        if (error instanceof OAuthRefusedError) throw error;
        throw new PortalUnavailableError(portal, nameOf(error));
      });
    const user = await this.accounts.identify(portal, {
      kind: 'oauth',
      accessToken: tokens.accessToken,
    });
    await this.accounts.link(
      userId,
      portal,
      'oauth',
      user,
      grantToSecret(tokens),
    );
  }
}
