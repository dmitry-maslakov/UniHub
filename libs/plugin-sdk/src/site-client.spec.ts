import { text } from 'node:stream/consumers';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  OutOfBudgetError,
  RequestFailedError,
  SiteClient,
} from './site-client.js';

// A made-up site, and another it must not reach.
const SITE = 'https://faculty.example.edu';
const ELSEWHERE = 'https://elsewhere.example.org';

const asked: { path: string; at: number; agent: string | null }[] = [];
const elsewhere: string[] = [];
const server = setupServer(
  http.get(`${SITE}/*`, async ({ request }) => {
    const { pathname } = new URL(request.url);
    asked.push({
      path: pathname,
      at: Date.now(),
      agent: request.headers.get('user-agent'),
    });
    if (pathname === '/away')
      return new HttpResponse(null, {
        status: 302,
        headers: { location: `${ELSEWHERE}/x` },
      });
    if (pathname.startsWith('/hop/')) {
      const left = Number(pathname.slice(5));
      return new HttpResponse(null, {
        status: 301,
        headers: { location: left ? `/hop/${left - 1}` : '/end' },
      });
    }
    if (pathname === '/slow') {
      await delay(500);
      return new HttpResponse('late');
    }
    if (pathname === '/big') return new HttpResponse('x'.repeat(2048));
    if (pathname === '/hang.pdf')
      return new HttpResponse(
        new ReadableStream({
          start: (stream) => stream.enqueue(new TextEncoder().encode('ab')),
        }),
      );
    return new HttpResponse(`page ${pathname}`, {
      headers: { 'content-type': 'Text/HTML; charset=utf-8' },
    });
  }),
  http.get(`${ELSEWHERE}/*`, ({ request }) => {
    elsewhere.push(new URL(request.url).pathname);
    return new HttpResponse('elsewhere');
  }),
);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  asked.length = 0;
  elsewhere.length = 0;
});
afterAll(() => server.close());

const client = (options: object = {}) =>
  new SiteClient({
    origin: SITE,
    userAgent: 'reader',
    delayMs: 0,
    maxRequests: 10,
    signal: new AbortController().signal,
    ...options,
  });
const at = (path: string) => new URL(`${SITE}${path}`);

describe('SiteClient', () => {
  it('asks the delay apart, as the agent it is given', async () => {
    const site = client({ delayMs: 150 });
    const answers = [];
    for (const path of ['/a', '/b', '/c'])
      answers.push(await site.text(at(path), 1024));

    expect(answers.map((a) => a.body)).toEqual([
      'page /a',
      'page /b',
      'page /c',
    ]);
    expect(answers[0]).toMatchObject({
      status: 200,
      type: 'text/html; charset=utf-8',
    });
    expect(asked.map((a) => a.agent)).toEqual(['reader', 'reader', 'reader']);
    for (let i = 1; i < asked.length; i++)
      expect(asked[i].at - asked[i - 1].at).toBeGreaterThanOrEqual(140);
  });

  it('follows a redirect on the site, each hop paced and counted', async () => {
    const site = client({ maxRequests: 3 });
    const answer = await site.text(at('/hop/1'), 1024);
    expect(answer.url.pathname).toBe('/end');
    expect(site.requests).toBe(3);
    await expect(site.text(at('/a'), 1024)).rejects.toThrow(OutOfBudgetError);
  });

  it('fails a redirect to another site without asking it, and a long chain', async () => {
    await expect(client().text(at('/away'), 1024)).rejects.toThrow(
      new RequestFailedError(at('/away'), 'redirected to another site'),
    );
    expect(elsewhere).toEqual([]);
    await expect(client().text(at('/hop/9'), 1024)).rejects.toThrow(
      'too many redirects',
    );
  });

  it('fails a text answer past its limit', async () => {
    await expect(client().text(at('/big'), 1024)).rejects.toThrow(
      RequestFailedError,
    );
  });

  it('gives up on a text request, its body too, past its deadline', async () => {
    await expect(
      client({ deadlineMs: 100 }).text(at('/slow'), 1024),
    ).rejects.toThrow('/slow');
  });

  it('cuts a download that sends nothing for too long, as one failed file', async () => {
    const { body } = await client({ idleMs: 200 }).stream(at('/hang.pdf'));
    await expect(text(body)).rejects.toThrow('no data for');
  });

  it('asks nothing once its signal aborts, and fails a download under way', async () => {
    const run = new AbortController();
    const site = client({ signal: run.signal });
    const { body } = await site.stream(at('/hang.pdf'));
    run.abort(new Error('the run is over'));
    await expect(text(body)).rejects.toThrow();
    await expect(site.text(at('/a'), 1024)).rejects.toThrow('the run is over');
    expect(asked.map((a) => a.path)).toEqual(['/hang.pdf']);
  });
});
