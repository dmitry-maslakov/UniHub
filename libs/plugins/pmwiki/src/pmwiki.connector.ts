import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  PollConnector,
  SiteClient,
  type ConnectorContext,
  type PollsPortal,
} from '@app/plugin-sdk';
import { pmwikiConfig } from './pmwiki.config.js';
import { Sync } from './pmwiki.sync.js';

// The listed PmWiki sites as a catalog: each course a wiki's Teaching page
// lists is a course, its page a post and the files it links its files.
// Read as the shared account, a request a second at most per site, and as
// robots.txt says (README, PmWiki).
@PollConnector({ portal: 'pmwiki', schedule: '40 * * * *', catalog: true })
@Injectable()
export class PmwikiConnector implements PollsPortal {
  constructor(
    @Inject(pmwikiConfig.KEY)
    private readonly config: ConfigType<typeof pmwikiConfig>,
  ) {}

  async poll({ ingest, signal }: ConnectorContext) {
    const { wikis, userAgent, delayMs, maxRequests, revisitDays } = this.config;
    // one per site for the run, so each keeps the site's pace and budget
    const clients = new Map<string, SiteClient>();
    const client = (origin: string) => {
      let site = clients.get(origin);
      if (!site) {
        site = new SiteClient({
          origin,
          userAgent,
          delayMs,
          maxRequests,
          signal,
        });
        clients.set(origin, site);
      }
      return site;
    };
    await new Sync({
      wikis,
      revisitDays,
      maxRequests,
      ingest,
      client,
      signal,
    }).run();
  }
}
