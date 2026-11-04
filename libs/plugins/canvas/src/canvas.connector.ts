import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  PollConnector,
  type ConnectorContext,
  type PollsPortal,
} from '@app/plugin-sdk';
import { CanvasApi } from './canvas-api.js';
import { CanvasSync } from './canvas-sync.js';
import { canvasConfig } from './canvas.config.js';
import type { Token } from './canvas.types.js';
import { visible } from './errors.js';

// Canvas sets how long a token lasts, the school may cut it shorter, and
// revokes them in bulk at times: two weeks' notice to make a new one.
export const WARN_BEFORE_MS = 14 * 24 * 60 * 60 * 1000;
// how Canvas finds a token without the whole of it
const HINT_LENGTH = 5;

// Canvas courses as the hub owner sees them, every hour, on the owner's
// own token: the one account is 'shared', so the owner sees to it that
// they may show the hub's readers what they see (README).
@PollConnector({ portal: 'canvas', schedule: '0 * * * *' })
@Injectable()
export class CanvasConnector implements PollsPortal {
  private readonly logger = new Logger(CanvasConnector.name);

  constructor(
    @Inject(canvasConfig.KEY)
    private readonly config: ConfigType<typeof canvasConfig>,
  ) {}

  async poll({ ingest, signal }: ConnectorContext) {
    const { url, userAgent } = this.config;
    const token = () => Promise.resolve(this.config.token);
    const api = new CanvasApi({ url, userAgent, token, signal });
    await this.warnOfExpiry(api, await token());
    await new CanvasSync(api, ingest, url).run();
  }

  // A token Canvas doesn't find by its hint, or won't show, goes unchecked;
  // one it no longer takes fails the run here, before anything is read.
  private async warnOfExpiry(api: CanvasApi, token: string) {
    const hint = encodeURIComponent(token.slice(0, HINT_LENGTH));
    const found = await visible(
      api.get<Token>(`/api/v1/users/self/tokens/${hint}`),
    );
    if (!found?.expires_at) return;
    if (Date.parse(found.expires_at) - Date.now() < WARN_BEFORE_MS)
      this.logger.warn(
        `the canvas token expires at ${found.expires_at}: make a new one and set CANVAS_TOKEN before then`,
      );
  }
}
