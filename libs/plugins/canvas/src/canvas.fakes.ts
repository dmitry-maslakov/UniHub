import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

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
// part of a file and ends the connection, or keeps it open for a path
// under /held/. Behind msw, a spec lets it through (passthrough()).
export class CuttingFileStore {
  url = '';
  // its end of the last connection: done sending, and closed (not once(),
  // which a reset would reject)
  ended = Promise.resolve();
  closed = Promise.resolve();
  private readonly server = createServer((req, res) => {
    this.ended = new Promise((done) => req.socket.once('finish', done));
    this.closed = new Promise((done) => req.socket.once('close', done));
    res.writeHead(200, { 'content-length': String(4 * 1024 * 1024) });
    res.write(Buffer.alloc(64 * 1024));
    if (!req.url?.startsWith('/held/')) req.socket.end();
  });

  // for the tests of one spec
  listen() {
    beforeAll(async () => {
      this.server.listen(0, '127.0.0.1');
      await once(this.server, 'listening');
      const { port } = this.server.address() as AddressInfo;
      this.url = `http://127.0.0.1:${port}`;
    });
    afterAll(() => {
      this.server.closeAllConnections();
      this.server.close();
    });
    return this;
  }
}
