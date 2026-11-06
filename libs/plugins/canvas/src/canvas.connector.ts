import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  CredentialRejectedError,
  PollConnector,
  type ConnectorContext,
  type Credential,
  type IdentifiesAccounts,
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
// with users' own tokens (README, Portal accounts): each user's account as
// it sees its courses, on its own grid.
@PollConnector({ portal: 'canvas', schedule: '0 * * * *', links: ['token'] })
@Injectable()
export class CanvasConnector implements PollsPortal, IdentifiesAccounts {
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
    // the user's: its expiry is theirs to see to
    const { token } = await account.credential();
    const api = new CanvasApi({
      ...this.config,
      token: token.reveal(),
      signal,
    });
    try {
      await new CanvasSync(api, ingest, this.config.url, 'own').run();
    } catch (error) {
      if (error instanceof TokenRejectedError)
        throw new CredentialRejectedError();
      throw error;
    }
  }

  // Whose a pasted token is, by Canvas's id for its user (nothing else of
  // what Canvas answers about them), and when it expires. A token Canvas
  // doesn't take, or whose user it won't show, is rejected.
  async identify({ token }: Credential, signal: AbortSignal) {
    const pasted = token.reveal();
    const api = new CanvasApi({ ...this.config, token: pasted, signal });
    try {
      const user = await api.get<User>('/api/v1/users/self');
      const found: PortalUser = {
        id: String(user.id),
        expiresAt: await expiryOf(api, pasted),
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
