import robots from 'robots-parser';
import { RequestFailedError, type SiteClient } from './site-client.js';

// the package's types say `default`, its code exports the function itself
const robotsParser = robots as unknown as typeof robots.default;

const ROBOTS_LIMIT = 1024 * 1024;
const MAX_CRAWL_DELAY_MS = 30_000;

export interface SiteRobots {
  // false for a page robots.txt disallows to the agent
  allowed(url: URL): boolean;
}

// The site's robots.txt for the agent, asked for once through the client:
// none (a 404) allows everything, and a Crawl-delay longer than the
// client's delay replaces it, up to 30 s. Any other answer, or none, is an
// error: a site that can't say what it allows is left alone.
export async function siteRobots(
  client: SiteClient,
  origin: string,
  userAgent: string,
): Promise<SiteRobots> {
  const url = new URL('/robots.txt', origin);
  const answer = await client.text(url, ROBOTS_LIMIT).catch((e) => {
    if (e instanceof RequestFailedError) throw new Error(e.message);
    throw e;
  });
  const ok = answer.status >= 200 && answer.status < 300;
  if (answer.status !== 404 && !ok)
    throw new Error(`robots.txt: the site answered ${answer.status}`);
  const parsed = robotsParser(url.href, ok ? answer.body : '');
  const wait = (parsed.getCrawlDelay(userAgent) ?? 0) * 1000;
  if (wait > client.delayMs)
    client.delayMs = Math.min(wait, MAX_CRAWL_DELAY_MS);
  return {
    allowed: (page) => parsed.isAllowed(page.href, userAgent) !== false,
  };
}
