import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { SiteClient } from './site-client.js';
import { siteRobots } from './site-robots.js';

const SITE = 'https://faculty.example.edu';
let robots: string | number = 404;
const server = setupServer(
  http.get(`${SITE}/robots.txt`, () =>
    typeof robots === 'number'
      ? new HttpResponse(null, { status: robots })
      : new HttpResponse(robots),
  ),
);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());

const client = (delayMs = 0) =>
  new SiteClient({
    origin: SITE,
    userAgent: 'reader',
    delayMs,
    maxRequests: 10,
    signal: new AbortController().signal,
  });
const at = (path: string) => new URL(`${SITE}${path}`);

describe('siteRobots', () => {
  it('disallows what robots.txt disallows to the agent', async () => {
    robots =
      'User-agent: reader\nDisallow: /private/\n\nUser-agent: *\nDisallow: /';
    const rules = await siteRobots(client(), SITE, 'reader');
    expect(rules.allowed(at('/private/a'))).toBe(false);
    expect(rules.allowed(at('/courses/a'))).toBe(true);
  });

  it('allows everything when there is none', async () => {
    robots = 404;
    const rules = await siteRobots(client(), SITE, 'reader');
    expect(rules.allowed(at('/anything'))).toBe(true);
  });

  it('fails on any other answer', async () => {
    robots = 500;
    await expect(siteRobots(client(), SITE, 'reader')).rejects.toThrow(
      'robots.txt: the site answered 500',
    );
  });

  it("takes the site's crawl-delay when it is longer than the client's, up to 30 s", async () => {
    const cases: [string, number, number][] = [
      ['2', 1000, 2000],
      ['0.5', 1000, 1000],
      ['3600', 1000, 30_000],
    ];
    for (const [delay, ours, then] of cases) {
      robots = `User-agent: *\nCrawl-delay: ${delay}`;
      const site = client(ours);
      await siteRobots(site, SITE, 'reader');
      expect(site.delayMs).toBe(then);
    }
  });
});
