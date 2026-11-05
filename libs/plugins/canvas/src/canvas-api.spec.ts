import { text } from 'node:stream/consumers';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { CanvasApi, LOW_QUOTA, PAUSE_MS, RETRY } from './canvas-api.js';
import { CuttingFileStore } from './canvas.fakes.js';
import {
  CanvasError,
  DownloadCutOffError,
  NotVisibleError,
  TokenRejectedError,
} from './errors.js';

// the wait on a low quota; the backoff runs on fake timers
const { sleep } = vi.hoisted(() => ({ sleep: vi.fn(async () => {}) }));
vi.mock('node:timers/promises', () => ({ setTimeout: sleep }));

const CANVAS = 'https://canvas.example.edu';
const server = setupServer();

const api = (signal = new AbortController().signal, url = CANVAS) =>
  new CanvasApi({ url, userAgent: 'test agent', token: 'the-token', signal });

// answers in turn, the last one from then on; keeps the requests, and
// when they came on the (fake) clock
function answering(...answers: (() => Response)[]) {
  const asked: { request: Request; at: number }[] = [];
  server.use(
    http.get(`${CANVAS}/api/v1/x`, ({ request }) => {
      asked.push({ request, at: Date.now() });
      return answers[Math.min(asked.length, answers.length) - 1]();
    }),
  );
  return asked;
}

const status =
  (code: number, body = '') =>
  () =>
    new HttpResponse(body, { status: code });
const ok = () => HttpResponse.json({ ok: true });

describe('CanvasApi', () => {
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterEach(() => {
    server.resetHandlers();
    sleep.mockClear();
    vi.useRealTimers();
  });
  afterAll(() => server.close());

  it('sends the token and a user agent with every request', async () => {
    const asked = answering(ok);
    expect(await api().get('/api/v1/x')).toEqual({ ok: true });
    const { headers } = asked[0].request;
    expect(headers.get('authorization')).toBe('Bearer the-token');
    expect(headers.get('user-agent')).toBe('test agent');
  });

  it('lists every page, following rel=next as Canvas gives it', async () => {
    const asked: string[] = [];
    const next = `${CANVAS}/api/v1/courses?page=bookmark:WzEwMV0&per_page=100`;
    server.use(
      http.get(`${CANVAS}/api/v1/courses`, ({ request }) => {
        asked.push(request.url);
        const last = request.url === next;
        return HttpResponse.json(last ? [3] : [1, 2], {
          headers: {
            link: last
              ? `<${CANVAS}/api/v1/courses?page=first>; rel="first"`
              : `<${next}>; rel="next", <${CANVAS}/api/v1/courses?page=first>; rel="first"`,
          },
        });
      }),
    );

    expect(await api().list('/api/v1/courses?enrollment_state=active')).toEqual(
      [1, 2, 3],
    );
    expect(asked).toEqual([
      `${CANVAS}/api/v1/courses?enrollment_state=active&per_page=100`,
      next,
    ]);
  });

  it('backs off while Canvas throttles: a 429, or a 403 that says so', async () => {
    vi.useFakeTimers();
    const asked = answering(
      status(403, '403 Forbidden (Rate Limit Exceeded)'),
      status(429),
      ok,
    );

    const got = api().get('/api/v1/x');
    await vi.runAllTimersAsync();
    expect(await got).toEqual({ ok: true });
    const waits = asked.slice(1).map(({ at }, i) => at - asked[i].at);
    // 1 and 2 s, each up to a fifth more
    expect(waits).toHaveLength(2);
    waits.forEach((wait, i) => {
      const least = 2 ** (i + 1) * RETRY.delayFactor;
      expect(wait).toBeGreaterThanOrEqual(least);
      expect(wait).toBeLessThanOrEqual(least * 1.2);
    });
  });

  it('tries again what the network failed', async () => {
    vi.useFakeTimers();
    const asked = answering(() => HttpResponse.error(), ok);

    const got = api().get('/api/v1/x');
    await vi.runAllTimersAsync();
    expect(await got).toEqual({ ok: true });
    expect(asked).toHaveLength(2);
  });

  it('gives up on a failing Canvas after its retries', async () => {
    vi.useFakeTimers();
    const asked = answering(status(502));

    const got = expect(api().get('/api/v1/x')).rejects.toMatchObject({
      status: 502,
    });
    await vi.runAllTimersAsync();
    await got;
    expect(asked).toHaveLength(RETRY.retries + 1);
  });

  it('takes a refusal for one: not visible, or a bad request', async () => {
    for (const [code, kind] of [
      [401, NotVisibleError],
      [403, NotVisibleError],
      [404, NotVisibleError],
      [400, CanvasError],
    ] as const) {
      const asked = answering(status(code, '{"status":"unauthorized"}'));
      await expect(api().get('/api/v1/x')).rejects.toBeInstanceOf(kind);
      expect(asked).toHaveLength(1);
    }
  });

  it('tells a token Canvas no longer takes from a 401 for one thing', async () => {
    answering(() =>
      HttpResponse.json(
        { errors: [{ message: 'Invalid access token.' }] },
        {
          status: 401,
          headers: { 'www-authenticate': 'Bearer realm="canvas-lms"' },
        },
      ),
    );
    const refused = api().get('/api/v1/x');
    await expect(refused).rejects.toBeInstanceOf(TokenRejectedError);
    await expect(refused).rejects.toThrow(/expired or was revoked/);
  });

  it('names the path in its errors, never a download verifier', async () => {
    server.use(http.get(`${CANVAS}/files/1/download`, () => status(500)()));
    vi.useFakeTimers();
    const got = expect(
      api().download(`${CANVAS}/files/1/download?verifier=secret`),
    ).rejects.toThrow('canvas answered 500 to /files/1/download');
    await vi.runAllTimersAsync();
    await got;
  });

  it("reads a download's refusal too, so the quota's goes again", async () => {
    let asked = 0;
    server.use(
      http.get(`${CANVAS}/files/1/download`, () =>
        asked++
          ? HttpResponse.text('%PDF one')
          : status(403, '403 Forbidden (Rate Limit Exceeded)')(),
      ),
    );
    vi.useFakeTimers();
    const got = api().download(`${CANVAS}/files/1/download`);
    await vi.runAllTimersAsync();
    expect(await text(await got)).toBe('%PDF one');
    expect(asked).toBe(2);
  });

  it('waits a while before going on once the quota runs low', async () => {
    const quota = (left: number) => () =>
      HttpResponse.json([], {
        headers: { 'x-rate-limit-remaining': String(left) },
      });
    const signal = new AbortController().signal;

    answering(quota(LOW_QUOTA + 300));
    await api(signal).get('/api/v1/x');
    expect(sleep).not.toHaveBeenCalled();

    answering(quota(LOW_QUOTA - 0.5));
    await api(signal).get('/api/v1/x');
    expect(sleep).toHaveBeenCalledWith(PAUSE_MS, undefined, { signal });
  });

  it('stops on the signal, a backoff too', async () => {
    vi.useFakeTimers();
    const asked = answering(status(429));
    const run = new AbortController();

    const got = expect(api(run.signal).get('/api/v1/x')).rejects.toBe(
      'stopped',
    );
    await vi.advanceTimersByTimeAsync(RETRY.delayFactor);
    run.abort('stopped');
    await got;
    await vi.runAllTimersAsync();
    expect(asked).toHaveLength(1);
  });

  it('downloads a file from where Canvas redirects to', async () => {
    server.use(
      http.get(`${CANVAS}/files/1/download`, () =>
        HttpResponse.redirect('https://files.example.edu/1', 302),
      ),
      http.get('https://files.example.edu/1', () =>
        HttpResponse.text('%PDF one'),
      ),
    );
    const content = await api().download(
      `${CANVAS}/files/1/download?download_frd=1&verifier=v`,
    );
    expect(await text(content)).toBe('%PDF one');
  });

  it('never sends the token on to another origin, a subdomain neither', async () => {
    const to: Record<string, string> = {
      1: 'https://files.example.edu/1',
      2: 'https://files.canvas.example.edu/2',
      3: `${CANVAS}/files/3`,
    };
    const tokens: Record<string, string | null> = {};
    server.use(
      http.get(`${CANVAS}/files/:id/download`, ({ params }) =>
        HttpResponse.redirect(to[String(params.id)], 302),
      ),
      ...Object.values(to).map((url) =>
        http.get(url, ({ request }) => {
          tokens[url] = request.headers.get('authorization');
          return HttpResponse.text('%PDF');
        }),
      ),
    );

    for (const id of Object.keys(to))
      await text(await api().download(`${CANVAS}/files/${id}/download`));
    expect(tokens).toEqual({
      [to[1]]: null,
      [to[2]]: null,
      // a redirect on Canvas itself keeps it
      [to[3]]: 'Bearer the-token',
    });
  });
});

// msw closed: a real connection the store ends while the download waits
// unread, as behind a slow storage, or keeps waiting
describe('CanvasApi on a file store that lets go', () => {
  const store = new CuttingFileStore().listen();
  const download = (path: string) =>
    api(undefined, store.url).download(`${store.url}${path}`);

  it('fails a download cut off partway, and nothing else', async () => {
    const uncaught = vi.fn();
    process.on('uncaughtException', uncaught);

    const content = await download('/files/1/download?verifier=secret');
    await store.ended;
    const read = text(content);
    await expect(read).rejects.toBeInstanceOf(DownloadCutOffError);
    await expect(read).rejects.toThrow(
      /^download of \/files\/1\/download cut off: aborted$/,
    );
    process.off('uncaughtException', uncaught);
    expect(uncaught).not.toHaveBeenCalled();
  });

  it('lets go of the connection with a download let go of unread', async () => {
    const content = await download('/held/1');
    content.destroy();
    await store.closed;
  });
});
