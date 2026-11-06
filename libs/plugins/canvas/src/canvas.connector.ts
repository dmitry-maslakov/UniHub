import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  bearerOf,
  CredentialRejectedError,
  PollConnector,
  type ConnectorContext,
  type Credential,
  type IdentifiesAccounts,
  type LinksByOAuth,
  type OAuthServer,
  type PollsPortal,
  type PortalUser,
} from '@app/plugin-sdk';
import { CanvasApi } from './canvas-api.js';
import { CanvasSync } from './canvas-sync.js';
import { canvasConfig } from './canvas.config.js';
import type { Token, User } from './canvas.types.js';
import { NotVisibleError, TokenRejectedError, visible } from './errors.js';

// Canvas sets how long a token lasts, the school may cut it shorter, and
// revokes them in bulk at times: two weeks' notice to make a new one.
export const WARN_BEFORE_MS = 14 * 24 * 60 * 60 * 1000;
// how Canvas finds a token without the whole of it
const HINT_LENGTH = 5;

// When a token stops working, as Canvas finds it by its hint: null when it
// never does, or Canvas doesn't find it or won't show it. One it no longer
// takes fails here.
async function expiryOf(api: CanvasApi, token: string) {
  const hint = encodeURIComponent(token.slice(0, HINT_LENGTH));
  const found = await visible(
    api.get<Token>(`/api/v1/users/self/tokens/${hint}`),
  );
  return found?.expires_at ? new Date(found.expires_at) : null;
}

// Canvas courses read as shared: as the hub owner sees them, every hour, on
// the owner's own token, what the whole course sees, so the owner sees to
// it that they may show the hub's readers what they see (README). Read
// with users' own tokens (README, Portal accounts), pasted or by Canvas's
// consent page: each user's account as it sees its courses, on its own
// grid.
@PollConnector({
  portal: 'canvas',
  schedule: '0 * * * *',
  links: ['token', 'oauth'],
})
@Injectable()
export class CanvasConnector
  implements PollsPortal, IdentifiesAccounts, LinksByOAuth
{
  private readonly logger = new Logger(CanvasConnector.name);

  constructor(
    @Inject(canvasConfig.KEY)
    private readonly config: ConfigType<typeof canvasConfig>,
  ) {}

  async poll({ ingest, signal, account }: ConnectorContext) {
    if (account.kind === 'shared') {
      const { token } = this.config;
      if (!token)
        throw new Error(
          'canvas is read as shared, on the hub owner’s token: set CANVAS_TOKEN',
        );
      const api = new CanvasApi({ ...this.config, token, signal });
      await this.warnOfExpiry(api, token);
      return new CanvasSync(api, ingest, this.config.url).run();
    }
    // the user's: its expiry is theirs to see to, or the hub's to renew
    const token = bearerOf(await account.credential()).reveal();
    const api = new CanvasApi({ ...this.config, token, signal });
    try {
      await new CanvasSync(api, ingest, this.config.url, 'own').run();
    } catch (error) {
      if (error instanceof TokenRejectedError)
        throw new CredentialRejectedError();
      throw error;
    }
  }

  // Whose a token is, pasted or by the consent page, by Canvas's id for its
  // user (nothing else of what Canvas answers about them), and when a
  // pasted one expires. A token Canvas doesn't take, or whose user it won't
  // show, is rejected.
  async identify(credential: Credential, signal: AbortSignal) {
    const token = bearerOf(credential).reveal();
    const api = new CanvasApi({ ...this.config, token, signal });
    try {
      const user = await api.get<User>('/api/v1/users/self');
      const found: PortalUser = {
        id: String(user.id),
        // one by the consent page lasts as long as the hub renews it
        expiresAt:
          credential.kind === 'token' ? await expiryOf(api, token) : null,
      };
      return found;
    } catch (error) {
      if (
        error instanceof TokenRejectedError ||
        error instanceof NotVisibleError
      )
        throw new CredentialRejectedError();
      throw error;
    }
  }

  // Canvas's consent page and token endpoint, and the hub's developer key
  // there, once the settings name one
  oauthServer(): OAuthServer | null {
    const { url, oauth } = this.config;
    if (!oauth) return null;
    return {
      issuer: url,
      authorizationEndpoint: new URL('/login/oauth2/auth', url).href,
      tokenEndpoint: new URL('/login/oauth2/token', url).href,
      ...oauth,
    };
  }

  // a token by the consent page taken back, Canvas's way
  async revoke(credential: Credential, signal: AbortSignal) {
    const token = bearerOf(credential).reveal();
    await new CanvasApi({ ...this.config, token, signal }).logout();
  }

  // A token Canvas doesn't find by its hint, or won't show, goes unchecked;
  // one it no longer takes fails the run here, before anything is read.
  private async warnOfExpiry(api: CanvasApi, token: string) {
    const expiresAt = await expiryOf(api, token);
    if (expiresAt && expiresAt.getTime() - Date.now() < WARN_BEFORE_MS)
      this.logger.warn(
        `the canvas token expires at ${expiresAt.toISOString()}: make a new one and set CANVAS_TOKEN before then`,
      );
  }
}
