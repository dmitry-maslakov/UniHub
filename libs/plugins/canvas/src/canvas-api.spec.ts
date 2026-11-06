import { text } from 'node:stream/consumers';
import { inspect } from 'node:util';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  CanvasApi,
  LOW_QUOTA,
  PAUSE_MS,
  RETRY,
  type CanvasApiOptions,
} from './canvas-api.js';
import { CuttingFileStore } from './canvas.fakes.js';
import {
  CanvasError,
  DownloadFailedError,
  NoAnswerError,
  NotAReadError,
  NotVisibleError,
  OtherOriginError,
  skippable,
  TokenRejectedError,
} from './errors.js';

// the wait on a low quota; the backoff runs on fake timers
const { sleep } = vi.hoisted(() => ({ sleep: vi.fn(async () => {}) }));
vi.mock('node:timers/promises', () => ({ setTimeout: sleep }));

const CANVAS = 'https://canvas.example.edu';
const server = setupServer();

const api = (options: Partial<CanvasApiOptions> = {}) =>
  new CanvasApi({
    url: CANVAS,
    userAgent: 'test agent',
    token: 'the-token',
    signal: new AbortController().signal,
    ...options,
  });

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

// what a request ended in, on fake timers through its retries
async function failure(request: Promise<unknown>) {
  const failed = request.then(
    () => expect.unreachable(),
    (error: unknown) => error,
  );
  await vi.runAllTimersAsync();
  return failed;
}

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

    expect(await failure(api().get('/api/v1/x'))).toMatchObject({
      status: 502,
    });
    expect(asked).toHaveLength(RETRY.retries + 1);
  });

  it("takes a page that isn't JSON for no answer: tried again, then failed", async () => {
    vi.useFakeTimers();
    const asked = answering(() =>
      HttpResponse.html('<html>down for maintenance</html>'),
    );

    const error = await failure(api().list('/api/v1/x'));
    expect(error).toBeInstanceOf(NoAnswerError);
    expect(error).toHaveProperty(
      'message',
      expect.stringMatching(/^no answer from canvas to \/api\/v1\/x: /),
    );
    expect(skippable(error)).toBe(false);
    expect(asked).toHaveLength(RETRY.retries + 1);
  });

  it('takes an empty body for no listing, unlike an empty list', async () => {
    answering(() => new HttpResponse(''));
    await expect(api().list('/api/v1/x')).rejects.toThrow(
      'no answer from canvas to /api/v1/x: not a list',
    );

    answering(() => HttpResponse.json([]));
    expect(await api().list('/api/v1/x')).toEqual([]);
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
    const error = await failure(
      api().download(`${CANVAS}/files/1/download?verifier=secret`),
    );
    expect(error).toHaveProperty(
      'message',
      'canvas answered 500 to /files/1/download',
    );
  });

  it("names a token's path without its hint, the token's start", async () => {
    const path = '/api/v1/users/self/tokens/1~abc';
    server.use(
      http.get(`${CANVAS}${path}`, () => status(500)()),
      http.get(`${CANVAS}/api/v1/users/self/tokens/2~xyz`, () =>
        HttpResponse.error(),
      ),
    );
    vi.useFakeTimers();

    const failed = await failure(api().get(path));
    expect(failed).toHaveProperty(
      'message',
      'canvas answered 500 to /api/v1/users/self/tokens/{hint}',
    );
    const unanswered = await failure(
      api().get('/api/v1/users/self/tokens/2~xyz'),
    );
    expect(unanswered).toBeInstanceOf(NoAnswerError);
    expect(inspect(unanswered)).toContain('/api/v1/users/self/tokens/{hint}');
    expect(inspect([failed, unanswered])).not.toMatch(/1~abc|2~xyz/);
  });

  it('fails just that file for a download that gets no answer, and holds neither the token nor the url', async () => {
    let asked = 0;
    server.use(
      http.get(`${CANVAS}/files/1/download`, () => {
        asked++;
        return HttpResponse.error();
      }),
    );
    vi.useFakeTimers();

    const error = await failure(
      api().download(`${CANVAS}/files/1/download?verifier=secret`),
    );
    expect(error).toBeInstanceOf(DownloadFailedError);
    expect(skippable(error)).toBe(true);
    expect(asked).toBe(RETRY.retries + 1);
    // axios's error would have both, in its config
    expect(inspect(error)).not.toMatch(/the-token|secret/);
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
    await api({ signal }).get('/api/v1/x');
    expect(sleep).not.toHaveBeenCalled();

    answering(quota(LOW_QUOTA - 0.5));
    await api({ signal }).get('/api/v1/x');
    expect(sleep).toHaveBeenCalledWith(PAUSE_MS, undefined, { signal });
  });

  it('stops on the signal, a backoff too', async () => {
    vi.useFakeTimers();
    const asked = answering(status(429));
    const run = new AbortController();

    const got = expect(
      api({ signal: run.signal }).get('/api/v1/x'),
    ).rejects.toBe('stopped');
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

  // msw errors on any request it has no handler for: none goes out. The
  // client only gets and lists, so a request of another kind is made past
  // them, as one added to it some day would
  it('sends the token with reads only, a HEAD too, as it has no scopes', async () => {
    const client = api()['http'];
    for (const method of ['post', 'put', 'patch', 'delete'] as const)
      await expect(
        client.request({ method, url: '/api/v1/x' }),
      ).rejects.toThrow(
        new NotAReadError(method, new URL(`${CANVAS}/api/v1/x`)),
      );

    server.use(http.head(`${CANVAS}/api/v1/x`, () => new HttpResponse(null)));
    expect((await client.head('/api/v1/x')).status).toBe(200);
  });

  // msw errors on any request it has no handler for: none goes out
  it("asks nothing of an origin but the school's Canvas, whatever url Canvas gives", async () => {
    await expect(
      api().download('https://elsewhere.example.edu/files/1?verifier=secret'),
    ).rejects.toThrow(
      'not sending the canvas token to https://elsewhere.example.edu/files/1: it goes to https://canvas.example.edu only',
    );

    server.use(
      http.get(`${CANVAS}/api/v1/courses`, () =>
        HttpResponse.json([1], {
          headers: {
            link: '<https://elsewhere.example.edu/api/v1/courses?page=2>; rel="next"',
          },
        }),
      ),
    );
    await expect(api().list('/api/v1/courses')).rejects.toBeInstanceOf(
      OtherOriginError,
    );
  });
});

// msw closed: real connections, which the store ends, holds or never answers
describe('CanvasApi on a file store that lets go', () => {
  const store = new CuttingFileStore().listen();
  const download = (path: string, options: Partial<CanvasApiOptions> = {}) =>
    api({ url: store.url, ...options }).download(`${store.url}${path}`);

  it('fails a download cut off partway, and nothing else', async () => {
    const uncaught = vi.fn();
    process.on('uncaughtException', uncaught);

    const content = await download('/files/1/download?verifier=secret');
    // the client has given up on the body by then, still unread
    await store.closed;
    const read = text(content);
    await expect(read).rejects.toBeInstanceOf(DownloadFailedError);
    await expect(read).rejects.toThrow(
      /^download of \/files\/1\/download failed: aborted$/,
    );
    process.off('uncaughtException', uncaught);
    expect(uncaught).not.toHaveBeenCalled();
  });

  it('fails a download that goes too long without a byte read', async () => {
    const content = await download('/held/1', { timeoutMs: 200 });
    await expect(text(content)).rejects.toThrow(
      'download of /held/1 failed: aborted',
    );
  });

  it('tries again a request with no answer in its time', async () => {
    const run = new AbortController();
    const got = expect(
      download('/silent/1', { signal: run.signal, timeoutMs: 200 }),
    ).rejects.toBe('stopped');
    // the first timed out, the second is its retry
    await store.requested(2);
    run.abort('stopped');
    await got;
  });

  it('fails a download the run stops, read or not', async () => {
    const before = new AbortController();
    const unread = await download('/held/1', { signal: before.signal });
    before.abort('stopped');
    await expect(text(unread)).rejects.toMatchObject({ name: 'AbortError' });

    const during = new AbortController();
    const content = await download('/held/2', { signal: during.signal });
    const chunks = content[Symbol.asyncIterator]();
    await chunks.next();
    during.abort('stopped');
    await expect(chunks.next()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('lets go of the connection with a download let go of unread', async () => {
    const content = await download('/held/1');
    content.destroy();
    await store.closed;
  });
});
