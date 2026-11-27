import { createHash } from 'node:crypto';
import { text } from 'node:stream/consumers';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  ContentHash,
  InvalidRecordError,
  type CoursePass,
  type CourseRecord,
  type FileRecord,
  type ItemRecord,
  type Json,
  type PortalIngest,
} from '@app/plugin-sdk';

// A made-up farm of PmWiki sites for the specs, on faculty.example.edu:
// /ana/, a teacher's, and /dept/, a department's.
export const SITE = 'https://faculty.example.edu';
export const ANA = `${SITE}/ana/`;
export const DEPT = `${SITE}/dept/`;

export type Reply =
  | string
  | number
  | {
      status?: number;
      body?: string;
      headers?: Record<string, string>;
    };

// Answers GET and HEAD by pathname and query; what isn't set is a 404.
// A file's HEAD says its size, and the date it's given.
export class FakeSite {
  routes = new Map<string, Reply>();
  // "GET /path?query" and "HEAD /path", in order, and when
  asked: string[] = [];
  times: number[] = [];
  agents = new Set<string | null>();
  readonly server = setupServer(
    http.all(`${SITE}/*`, ({ request }) => {
      const url = new URL(request.url);
      const at = url.pathname + url.search;
      this.asked.push(`${request.method} ${at}`);
      this.times.push(Date.now());
      this.agents.add(request.headers.get('user-agent'));
      const reply = this.routes.get(at) ?? 404;
      const head = request.method === 'HEAD';
      if (typeof reply === 'number')
        return new HttpResponse(null, { status: reply });
      const {
        status = 200,
        body = '',
        headers = {},
      } = typeof reply === 'string' ? { body: reply } : reply;
      return new HttpResponse(head ? null : body, {
        status,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-length': String(Buffer.byteLength(body)),
          ...headers,
        },
      });
    }),
  );

  set(at: string, reply: Reply) {
    this.routes.set(at.replace(SITE, ''), reply);
    return this;
  }

  // a file as the site serves it, of a date
  file(at: string, body: string, date = 'Tue, 25 Jan 2022 11:34:03 GMT') {
    const type = at.endsWith('.htm') ? 'text/html' : 'application/pdf';
    return this.set(at, {
      body,
      headers: { 'content-type': type, 'last-modified': date },
    });
  }

  // what was asked, the robots.txt aside, without the site
  get requests() {
    return this.asked.filter((a) => !a.endsWith('/robots.txt'));
  }

  // for the tests of one spec: listening before, reset after each
  listen() {
    beforeAll(() => this.server.listen({ onUnhandledFrame: 'error' }));
    beforeEach(() => {
      this.routes = new Map();
      this.asked = [];
      this.times = [];
      this.agents = new Set();
    });
    afterAll(() => this.server.close());
    return this;
  }
}

const path = (url: string) => url.replace(SITE, '');

// A page of a wiki as PmWiki's skins make one: its title, its actions'
// links at its own address, its text in #wikitext.
export function wikiPage(title: string, at: string, text: string) {
  const self = path(at);
  return `<!DOCTYPE html><html><head><title>${title} | Page</title></head><body>
<div id='wikihead'><a href='${self}?action=search'>Search</a><a href='/ana/Main/HomePage'>Home</a></div>
<div id='wikitext'>${text}</div>
<div id='wikifoot'><a href='${self}?action=edit'>Edit</a> <a href='${self}?action=diff'>History</a> <a href='${self}?action=print'>Print</a></div>
</body></html>`;
}

// Site.AllRecentChanges's list: each page's name, address and time
export const changes = (
  title: string,
  wiki: string,
  ...pages: (readonly [name: string, at: string, time: string])[]
) =>
  wikiPage(
    title,
    `${wiki}Site/AllRecentChanges`,
    `<ul>${pages
      .map(
        ([name, at, time]) =>
          `<li><a class='wikilink' href='${at}'>${name}</a>  . . . ${time} by <a class='createlinktext' href='${wiki}Profiles/Ana?action=edit'>ana</a>: </li>`,
      )
      .join('\n')}</ul>`,
  );

// Site.Search's list of pages: each group, and its pages, the group Main's
// at addresses without it, as PmWiki has them
export const pages = (
  title: string,
  wiki: string,
  ...groups: [group: string, names: string[]][]
) =>
  wikiPage(
    title,
    `${wiki}Site/Search`,
    `<div class='wikisearch'><dl>${groups
      .map(
        ([group, names]) =>
          `<dt><a class='wikilink' href='${wiki}${group}'>${group}</a> /</dt>${names
            .map(
              (name) =>
                `<dd><a class='wikilink' href='${wiki}${group === 'Main' ? '' : `${group}/`}${name}'>${name}</a></dd>`,
            )
            .join('')}`,
      )
      .join('')}</dl></div>`,
  );

// where the fakes ask a wiki's lists
export const changesAt = (wiki: string) => `${wiki}?n=Site.AllRecentChanges`;
export const pagesAt = (wiki: string) =>
  `${wiki}?n=Site.Search&action=search&q=%2F`;

// a NUL in a string or a key, not a backslash and u0000 written out
const hasNul = (value: unknown): boolean =>
  typeof value === 'string'
    ? value.includes('\u0000')
    : value !== null && typeof value === 'object'
      ? Object.entries(value).some(([k, v]) => hasNul(k) || hasNul(v))
      : false;

// What the hub would keep of a public portal's one account, as it answers
// courses() and pass(): the catalog the last listing named, each course's
// view as its passes left it, and the files' contents by the version
// (size and date) they came for. Content comes once every pass of the run
// has ended. Like the hub's, it refuses a NUL and rejects everything once
// the run's signal is aborted.
export class RecordingIngest implements PortalIngest {
  catalog: CourseRecord[] = [];
  readonly items = new Map<string, ItemRecord>();
  readonly files = new Map<string, FileRecord>();
  // each course's view: the files its passes left in it
  readonly views = new Map<string, Set<string>>();
  readonly contents = new Map<string, { version: string; body: string }>();
  // "pass c", "end c", "content f": what came, in order
  readonly log: string[] = [];
  readonly gone: string[] = [];
  tooLarge = new Set<string>();
  saved: Json | null = null;
  saves = 0;
  signal?: AbortSignal;
  private open = 0;

  private accept(record: object) {
    this.signal?.throwIfAborted();
    if (hasNul(JSON.parse(JSON.stringify(record))))
      throw new InvalidRecordError(['contains a NUL character']);
  }

  private version = (record: FileRecord) =>
    `${record.size ?? ''}@${record.updatedAt?.toISOString() ?? ''}`;

  async courses(records: CourseRecord[]) {
    this.signal?.throwIfAborted();
    this.catalog = records;
    return { refused: [] };
  }

  async pass(course: string): Promise<CoursePass> {
    this.signal?.throwIfAborted();
    if (!this.catalog.some((c) => c.externalId === course))
      throw new Error(`course ${course} was never listed`);
    this.log.push(`pass ${course}`);
    this.open++;
    const sent = new Set<string>();
    return {
      item: async (record) => {
        this.accept(record);
        this.items.set(record.externalId, record);
      },
      file: async (record) => {
        this.accept(record);
        this.files.set(record.externalId, record);
        sent.add(record.externalId);
        const had = this.contents.get(record.externalId);
        return { fetch: had?.version !== this.version(record) };
      },
      end: async (gone) => {
        this.signal?.throwIfAborted();
        const view = this.views.get(course) ?? new Set<string>();
        for (const id of sent) view.add(id);
        for (const id of gone?.files ?? []) {
          view.delete(id);
          this.gone.push(id);
        }
        this.views.set(course, view);
        this.log.push(`end ${course}`);
        this.open--;
      },
      content: async (id, content) => {
        this.signal?.throwIfAborted();
        if (this.open) throw new Error('content before every pass ended');
        const body = await text(content);
        if (this.tooLarge.has(id))
          throw new InvalidRecordError(['too large'], 'CONTENT_TOO_LARGE');
        this.contents.set(id, {
          version: this.version(this.files.get(id)!),
          body,
        });
        this.log.push(`content ${id}`);
        const hash = createHash('sha256').update(body).digest('hex');
        return { hash: ContentHash.parse(hash) };
      },
    };
  }

  async state() {
    return this.saved;
  }

  async saveState(state: Json) {
    this.signal?.throwIfAborted();
    this.saves++;
    this.saved = structuredClone(state);
  }

  async course(): Promise<never> {
    throw new Error('the pmwiki connector sends what it sees as a whole');
  }

  async item(): Promise<never> {
    throw new Error('the pmwiki connector sends what it sees as a whole');
  }

  async file(): Promise<never> {
    throw new Error('the pmwiki connector sends what it sees as a whole');
  }

  async content(): Promise<never> {
    throw new Error('the pmwiki connector sends what it sees as a whole');
  }

  async removeItem(): Promise<never> {
    throw new Error('the pmwiki connector sends what it sees as a whole');
  }

  async removeFile(): Promise<never> {
    throw new Error('the pmwiki connector sends what it sees as a whole');
  }
}
