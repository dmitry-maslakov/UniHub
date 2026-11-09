import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  PollConnector,
  type ConnectorContext,
  type PollsPortal,
} from '@app/plugin-sdk';
import { SiteClient } from './website.client.js';
import { websiteConfig } from './website.config.js';
import { Crawl } from './website.crawl.js';

// A public website as a catalog: each configured section is a course, each
// page of it a post and the documents the pages link its files. Read as
// the shared account, through the site's sitemaps, a request a second at
// most, and as robots.txt says (README, Website).
@PollConnector({ portal: 'website', schedule: '20 * * * *', catalog: true })
@Injectable()
export class WebsiteConnector implements PollsPortal {
  constructor(
    @Inject(websiteConfig.KEY)
    private readonly config: ConfigType<typeof websiteConfig>,
  ) {}

  async poll({ ingest, signal }: ConnectorContext) {
    const { url, sections, userAgent, delayMs, maxRequests } = this.config;
    const origin = new URL(url).origin;
    const client = new SiteClient({
      origin,
      userAgent,
      delayMs,
      maxRequests,
      signal,
    });
    await new Crawl({
      origin,
      userAgent,
      sections,
      ingest,
      client,
      signal,
    }).run();
  }
}
