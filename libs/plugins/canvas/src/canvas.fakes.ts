import { EventEmitter, once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type * as agents from 'request-filtering-agent';

// A Canvas for the specs, made up: canvas.example.edu, one course.

export const CANVAS_URL = 'https://canvas.example.edu';
// its hint, the first 5 characters, finds it in fixtures/canvas.json
export const TOKEN = '1~abcdefghijklmnopqrstuvwxyz';
const FILES_HOST = 'https://files.example.edu';

const recorded = () =>
  JSON.parse(
    readFileSync(new URL('./fixtures/canvas.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown>;

// Canvas's answer to a request it won't serve the token's user
export const refusal = (status: number) =>
  HttpResponse.json(
    { status: 'unauthorized', errors: [{ message: 'user not authorized' }] },
    { status },
  );

// Answers by path, as recorded in fixtures/canvas.json; a spec changes
// `answers` (a number answers with that status) or adds handlers to
// `server`. Downloads redirect to another host, as Canvas's do.
export class FakeCanvas {
  answers = recorded();
  // file id → content
  contents: Record<string, string> = {
    '3001': '%PDF lecture one',
    '3002': '%PDF schedule',
  };
  // the paths asked for, in order
  asked: string[] = [];
  readonly server = setupServer(
    http.get(`${CANVAS_URL}/files/:id/download`, ({ params }) =>
      HttpResponse.redirect(`${FILES_HOST}/${String(params.id)}`, 302),
    ),
    http.get(`${FILES_HOST}/:id`, ({ params }) => {
      this.asked.push(`download ${String(params.id)}`);
      return new HttpResponse(this.contents[String(params.id)]);
    }),
    http.get(`${CANVAS_URL}/api/v1/*`, ({ request }) => {
      const { pathname } = new URL(request.url);
      this.asked.push(pathname);
      if (request.headers.get('authorization') !== `Bearer ${TOKEN}`)
        return HttpResponse.json(
          { errors: [{ message: 'Invalid access token.' }] },
          {
            status: 401,
            headers: { 'www-authenticate': 'Bearer realm="canvas-lms"' },
          },
        );
      const answer = this.answers[pathname];
      if (answer === undefined) return refusal(404);
      if (typeof answer === 'number') return refusal(answer);
      return HttpResponse.json(answer);
    }),
  );

  // for the tests of one spec: listening before, reset after each
  listen() {
    beforeAll(() => this.server.listen({ onUnhandledFrame: 'error' }));
    beforeEach(() => {
      this.answers = recorded();
      this.asked = [];
    });
    afterEach(() => this.server.resetHandlers());
    afterAll(() => this.server.close());
    return this;
  }
}

// A file store on a socket of its own, for what msw can't fake: it sends
// part of a file and ends the connection; under /held/ it keeps it open
// instead, and under /silent/ it never answers. Behind msw, a spec lets it
// through (passthrough()). It listens on loopback, which the sdk's guard
// on portal requests refuses (its own spec checks that), so a spec that
// downloads from it lets that one address in: vi.mock of
// request-filtering-agent with letInLoopback.
export class CuttingFileStore {
  url = '';
  // the paths asked for, in order
  readonly asked: string[] = [];
  // its end of the last connection, once closed (not once(), which a reset
  // would reject): the client gave up on the body by then
  closed = Promise.resolve();
  private readonly requests = new EventEmitter();
  private readonly server = createServer((req, res) => {
    this.asked.push(req.url ?? '');
    this.requests.emit('request');
    this.closed = new Promise((done) => req.socket.once('close', done));
    if (req.url?.startsWith('/silent/')) return;
    res.writeHead(200, { 'content-length': String(4 * 1024 * 1024) });
    res.write(Buffer.alloc(64 * 1024));
    if (!req.url?.startsWith('/held/')) req.socket.end();
  });

  // once this many requests have come
  async requested(count: number) {
    while (this.asked.length < count) await once(this.requests, 'request');
  }

  // for the tests of one spec
  listen() {
    beforeAll(async () => {
      this.server.listen(0, '127.0.0.1');
      await once(this.server, 'listening');
      const { port } = this.server.address() as AddressInfo;
      this.url = `http://127.0.0.1:${port}`;
    });
    beforeEach(() => {
      this.asked.length = 0;
    });
    afterAll(() => {
      this.server.closeAllConnections();
      this.server.close();
    });
    return this;
  }
}

// request-filtering-agent's agents, letting in the file store's address
export async function letInLoopback(
  original: () => Promise<typeof agents>,
): Promise<typeof agents> {
  const { RequestFilteringHttpAgent, RequestFilteringHttpsAgent, ...rest } =
    await original();
  const allow = { allowIPAddressList: ['127.0.0.1'] };
  return {
    ...rest,
    RequestFilteringHttpAgent: class extends RequestFilteringHttpAgent {
      constructor(options?: object) {
        super({ ...options, ...allow });
      }
    },
    RequestFilteringHttpsAgent: class extends RequestFilteringHttpsAgent {
      constructor(options?: object) {
        super({ ...options, ...allow });
      }
    },
  };
}
