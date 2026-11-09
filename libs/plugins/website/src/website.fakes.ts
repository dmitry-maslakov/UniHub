import { text } from 'node:stream/consumers';
import type { Readable } from 'node:stream';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  ContentHash,
  InvalidRecordError,
  type CourseRecord,
  type FileRecord,
  type ItemRecord,
  type Json,
  type PortalIngest,
} from '@app/plugin-sdk';
import { createHash } from 'node:crypto';

// A site for the specs, made up: faculty.example.edu.
export const SITE = 'https://faculty.example.edu';
const ELSEWHERE = 'https://elsewhere.example.org';

export type Reply =
  | string
  | number
  | { status?: number; body?: string; headers?: Record<string, string> };

// Answers by pathname; what isn't set is a 404.
export class FakeSite {
  routes = new Map<string, Reply>();
  // "GET /path", in order, and when
  asked: string[] = [];
  times: number[] = [];
  agents = new Set<string | null>();
  // what another origin was asked, which nothing should
  elsewhere: string[] = [];
  readonly server = setupServer(
    http.get(`${SITE}/*`, ({ request }) => {
      const { pathname } = new URL(request.url);
      this.asked.push(pathname);
      this.times.push(Date.now());
      this.agents.add(request.headers.get('user-agent'));
      const reply = this.routes.get(pathname) ?? 404;
      if (typeof reply === 'number')
        return new HttpResponse(null, { status: reply });
      if (typeof reply === 'string') return new HttpResponse(reply);
      return new HttpResponse(reply.body ?? null, {
        status: reply.status ?? 200,
        headers: reply.headers,
      });
    }),
    http.get(`${ELSEWHERE}/*`, ({ request }) => {
      this.elsewhere.push(new URL(request.url).pathname);
      return new HttpResponse('elsewhere');
    }),
  );

  set(path: string, reply: Reply) {
    this.routes.set(path, reply);
    return this;
  }

  // for the tests of one spec: listening before, reset after each
  listen() {
    beforeAll(() => this.server.listen({ onUnhandledFrame: 'error' }));
    beforeEach(() => {
      this.routes = new Map();
      this.asked = [];
      this.times = [];
      this.agents = new Set();
      this.elsewhere = [];
    });
    afterEach(() => this.server.resetHandlers());
    afterAll(() => this.server.close());
    return this;
  }
}

// a sitemap listing these pages, each a path or [path, lastmod]
export const sitemap = (...pages: (string | [string, string])[]) =>
  `<?xml version="1.0"?><urlset>${pages
    .map((page) => {
      const [path, lastmod] = typeof page === 'string' ? [page] : page;
      const loc = path.startsWith('http') ? path : `${SITE}${path}`;
      return `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
    })
    .join('\n')}</urlset>`;

export const page = (main: string, title = 'A page') =>
  `<html><head><title>${title}</title></head><body><nav>menu</nav><main>${main}</main></body></html>`;

export const TEXT =
  'Notes of the lecture, with enough words to be worth reading.';

// What the hub would keep of the connector's runs, record by record
// (a portal read as shared), as it answers: a file's content is wanted until
// it has some (`wantsContent` off, never).
export class RecordingIngest implements PortalIngest {
  readonly courses_ = new Map<string, CourseRecord>();
  readonly items = new Map<string, ItemRecord>();
  readonly files = new Map<string, FileRecord>();
  readonly contents = new Map<string, string>();
  readonly removedItems: string[] = [];
  readonly removedFiles: string[] = [];
  wantsContent = true;
  // content refused as too large
  tooLarge = new Set<string>();
  saved: Json | null = null;
  saves = 0;

  async course(record: CourseRecord) {
    this.courses_.set(record.externalId, record);
    return { changed: true };
  }

  async item(record: ItemRecord) {
    this.items.set(record.externalId, record);
    return { changed: true };
  }

  async file(record: FileRecord) {
    this.files.set(record.externalId, record);
    return {
      changed: true,
      needsContent: this.wantsContent && !this.contents.has(record.externalId),
    };
  }

  async content(id: string, content: Readable) {
    const body = await text(content);
    if (this.tooLarge.has(id))
      throw new InvalidRecordError(['too large'], 'CONTENT_TOO_LARGE');
    this.contents.set(id, body);
    const hash = createHash('sha256').update(body).digest('hex');
    return { hash: ContentHash.parse(hash), changed: true };
  }

  async removeItem(id: string) {
    this.removedItems.push(id);
    return { changed: this.items.delete(id) };
  }

  async removeFile(id: string) {
    this.removedFiles.push(id);
    this.contents.delete(id);
    return { changed: this.files.delete(id) };
  }

  async state() {
    return this.saved;
  }

  async saveState(state: Json) {
    this.saves++;
    this.saved = structuredClone(state);
  }

  async courses(): Promise<never> {
    throw new Error('the website sends record by record');
  }

  async pass(): Promise<never> {
    throw new Error('the website sends record by record');
  }
}
