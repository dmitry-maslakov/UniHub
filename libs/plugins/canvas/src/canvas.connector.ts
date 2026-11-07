import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { z } from 'zod';
import {
  CredentialRejectedError,
  PollConnector,
  TokensNotAllowedError,
  type ConnectorContext,
  type Credential,
  type HasInstances,
  type IdentifiesAccounts,
  type PollsPortal,
  type PortalUser,
} from '@app/plugin-sdk';
import { CanvasApi } from './canvas-api.js';
import { CanvasSync } from './canvas-sync.js';
import { canvasConfig } from './canvas.config.js';
import type { Token } from './canvas.types.js';
import {
  NotCanvasError,
  NotVisibleError,
  TokenRejectedError,
  visible,
} from './errors.js';
import { hostedByInstructure } from './instructure.js';

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

// the token's user, as Canvas answers it: of all it says (names, an
// avatar), only the id is read, and an answer without one is no Canvas's
const User = z.object({ id: z.number().int() });

// Canvas courses read as shared: as the hub owner sees them, every hour, on
// the owner's own token, what the whole course sees, so the owner sees to
// it that they may show the hub's readers what they see (README). Read
// with users' own tokens (README, Portal accounts): each user's account as
// it sees its courses, on its own grid, of the school's Canvas the user
// linked it with, each school's records kept apart (instances).
@PollConnector({
  portal: 'canvas',
  schedule: '0 * * * *',
  links: ['token'],
  instances: true,
})
@Injectable()
export class CanvasConnector
  implements PollsPortal, IdentifiesAccounts, HasInstances
{
  private readonly logger = new Logger(CanvasConnector.name);

  constructor(
    @Inject(canvasConfig.KEY)
    private readonly config: ConfigType<typeof canvasConfig>,
  ) {}

  // the Canvas read as shared, CANVAS_URL
  configuredInstance() {
    return this.config.url;
  }

  async poll({ ingest, signal, account }: ConnectorContext) {
    if (account.kind === 'shared') {
      const { url, token } = this.config;
      if (!url || !token)
        throw new Error(
          'canvas is read as shared, on the hub owner’s token: set CANVAS_URL and CANVAS_TOKEN',
        );
      const api = new CanvasApi({ ...this.config, url, token, signal });
      await this.warnOfExpiry(api, token);
      return new CanvasSync(api, ingest, url).run();
    }
    // the user's: its expiry is theirs to see to
    const credential = await account.credential();
    const url = this.siteOf(credential);
    const api = new CanvasApi({
      ...this.config,
      url,
      token: credential.token.reveal(),
      signal,
    });
    try {
      await new CanvasSync(api, ingest, url, 'own').run();
    } catch (error) {
      if (error instanceof TokenRejectedError)
        throw new CredentialRejectedError();
      throw error;
    }
  }

  // Whose a pasted token is, by Canvas's id for its user (nothing else of
  // what Canvas answers about them), and when it expires. A Canvas that
  // Instructure hosts takes no pasted token, so the token isn't sent there
  // at all; a token Canvas doesn't take is rejected; an address where no
  // Canvas shows the token's user is no Canvas, as one away is.
  async identify(credential: Credential, signal: AbortSignal) {
    const url = this.siteOf(credential);
    if (await hostedByInstructure(url, signal))
      throw new TokensNotAllowedError();
    const pasted = credential.token.reveal();
    const api = new CanvasApi({ ...this.config, url, token: pasted, signal });
    try {
      const user = User.safeParse(await api.get('/api/v1/users/self'));
      if (!user.success) throw new NotCanvasError(url);
      const found: PortalUser = {
        id: String(user.data.id),
        expiresAt: await expiryOf(api, pasted),
      };
      return found;
    } catch (error) {
      if (error instanceof TokenRejectedError)
        throw new CredentialRejectedError();
      if (error instanceof NotVisibleError) throw new NotCanvasError(url);
      throw error;
    }
  }

  // The Canvas a user's token is of, as the hub says: the one it was
  // linked with, or the one its account was given since; for one linked
  // before tokens kept theirs and given none yet, the school's (CANVAS_URL)
  private siteOf({ url }: Credential) {
    const site = url ?? this.config.url;
    if (!site)
      throw new Error(
        'a canvas account linked before accounts kept their Canvas, and no CANVAS_URL: link it again',
      );
    return site;
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
