import { text } from 'node:stream/consumers';
import { Logger } from '@nestjs/common';
import type { MockInstance } from 'vitest';
import {
  InvalidRecordError,
  PortalId,
  UnknownReferenceError,
} from '@app/plugin-sdk';
import { websiteSettings } from './website.config.js';
import { SiteClient } from './website.client.js';
import { WebsiteConnector } from './website.connector.js';
import {
  FakeSite,
  page,
  RecordingIngest,
  sitemap,
  SITE,
  TEXT,
} from './website.fakes.js';

const site = new FakeSite().listen();
const SECTION = { id: 'courses', name: 'Courses', sitemap: '/sitemap.xml' };
const DAY = 86_400_000;
const today = () => Math.floor(Date.now() / DAY);
const portal = PortalId.parse('website');

let ingest: RecordingIngest;
let warn: MockInstance;
beforeEach(() => {
  ingest = new RecordingIngest();
  warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// the clock moves on, nothing else
const later = (ms: number) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + ms);
};

interface Options {
  sections?: object[];
  env?: Record<string, string>;
  signal?: AbortSignal;
}
const run = ({ sections = [SECTION], env = {}, signal }: Options = {}) => {
  signal ??= new AbortController().signal;
  ingest.signal = signal;
  return new WebsiteConnector(
    websiteSettings.parse({
      WEBSITE_URL: SITE,
      WEBSITE_SECTIONS: JSON.stringify(sections),
      WEBSITE_DELAY_MS: '0',
      ...env,
    }),
  ).poll({
    connection: { portal, account: 'shared' },
    account: { kind: 'shared' },
    ingest,
    signal,
  });
};

const state = () =>
  ingest.saved as { pages: Record<string, Record<string, unknown>> };
// a page the site serves, listed or not
const serve = (path: string, main = TEXT, title?: string) =>
  site.set(path, page(main, title));
const pagesAsked = () => site.asked.filter((p) => p.startsWith('/p'));
const withFiles = { ...SECTION, files: true };

describe('WebsiteConnector', () => {
  describe('catalog and requests', () => {
    it('sends every section as a course, every run, and asks as the agent says', async () => {
      const second = { id: 'news', name: 'News', sitemap: '/news.xml' };
      await run({
        sections: [SECTION, second],
        env: { WEBSITE_USER_AGENT: 'reader' },
      });

      expect([...ingest.courses_.values()]).toEqual([
        { externalId: 'courses', name: 'Courses', url: SITE },
        { externalId: 'news', name: 'News', url: SITE },
      ]);
      expect([...site.agents]).toEqual(['reader']);
      expect(site.asked).toEqual(['/robots.txt', '/sitemap.xml', '/news.xml']);
    });

    it('reads the sitemap: entities, duplicates, other origins, include and exclude', async () => {
      site.set(
        '/sitemap.xml',
        sitemap(
          '/p/a',
          ['/p/a?x=1&amp;y=2', '2026-01-01'],
          '/p/a',
          'https://elsewhere.example.org/p/x',
          'http://faculty.example.edu/p/http',
          '/p/b%20c',
          '/p/old/d',
          '/q/e',
        ),
      );
      for (const p of ['/p/a', '/p/b%20c', '/p/old/d', '/q/e']) serve(p);
      await run({
        sections: [{ ...SECTION, include: '^/p/', exclude: '/old/' }],
      });

      expect(pagesAsked().sort()).toEqual(['/p/a', '/p/b%20c']);
      expect([...ingest.items.keys()].sort()).toEqual(['/p/a', '/p/b%20c']);
      expect(site.elsewhere).toEqual([]);
    });

    it('decodes entities in locations and lastmods', async () => {
      site.set(
        '/sitemap.xml',
        '<urlset><url><loc>https://faculty.example.edu/p/a?x=1&amp;y=2</loc><lastmod>2026-01-01&amp;</lastmod></url></urlset>',
      );
      serve('/p/a');
      await run();

      expect(ingest.items.get('/p/a')?.url).toBe(`${SITE}/p/a?x=1&y=2`);
      expect(state().pages['/p/a']).toMatchObject({ m: '2026-01-01&' });
    });
  });

  describe('robots.txt', () => {
    beforeEach(() => {
      site.set('/sitemap.xml', sitemap('/p/a', '/p/private/b'));
      serve('/p/a');
      serve('/p/private/b');
    });

    it('leaves a disallowed page alone', async () => {
      site.set('/robots.txt', 'User-agent: *\nDisallow: /p/private/');
      await run();

      expect([...ingest.items.keys()]).toEqual(['/p/a']);
      expect(pagesAsked()).toEqual(['/p/a']);
    });

    it('allows everything when there is none', async () => {
      await run();
      expect(ingest.items.size).toBe(2);
    });

    it('ends the run on any other failure', async () => {
      site.set('/robots.txt', 500);
      await expect(run()).rejects.toThrow('robots.txt');
      expect(site.asked).toEqual(['/robots.txt']);
      expect(ingest.courses_.size).toBe(0);
    });

    it("waits as long as the site's crawl-delay asks, when it is more than ours", async () => {
      site.set('/robots.txt', 'User-agent: *\nCrawl-delay: 0.3');
      serve('/p/private/b');
      await run();

      expect(site.times).toHaveLength(4);
      for (let i = 1; i < site.times.length; i++)
        expect(site.times[i] - site.times[i - 1]).toBeGreaterThanOrEqual(280);
    });
  });

  describe('which pages are due', () => {
    const listed = (...pages: (string | [string, string])[]) =>
      site.set('/sitemap.xml', sitemap(...pages));

    it('reads the pages it has not, then the longest since read, then by path', async () => {
      listed('/p/c', '/p/b', '/p/a', '/p/d');
      for (const p of ['/p/a', '/p/b', '/p/c', '/p/d']) serve(p);
      const day = today();
      ingest.saved = {
        v: 1,
        pages: {
          '/p/a': { s: 'courses', m: null, d: day - 1, f: [] },
          '/p/b': { s: 'courses', m: null, d: day - 5, f: [] },
        },
      };
      await run({ sections: [{ ...SECTION, revisitDays: 1 }] });

      expect(pagesAsked()).toEqual(['/p/c', '/p/d', '/p/b', '/p/a']);
    });

    it('reads a page again when its lastmod changed, and not when it did not', async () => {
      listed(['/p/a', '2026-01-01'], ['/p/b', '2026-01-01'], '/p/c');
      for (const p of ['/p/a', '/p/b', '/p/c']) serve(p);
      await run();
      expect(pagesAsked()).toHaveLength(3);

      site.asked = [];
      listed(['/p/a', '2026-02-02'], ['/p/b', '2026-01-01'], '/p/c');
      await run();
      expect(pagesAsked()).toEqual(['/p/a']);
    });

    it('reads a page again after revisitDays, whatever its lastmod, and ignores a changing one', async () => {
      const revisit = { ...SECTION, revisitDays: 3 };
      listed(['/p/a', '2026-01-01'], ['/p/b', '2026-01-01']);
      serve('/p/a');
      serve('/p/b');
      await run({ sections: [revisit] });
      expect(pagesAsked()).toHaveLength(2);

      // a lastmod that changes every day: nothing is due for it
      site.asked = [];
      listed(['/p/a', '2026-03-03'], ['/p/b', '2026-03-03']);
      await run({ sections: [revisit] });
      expect(pagesAsked()).toEqual([]);

      const days = state().pages as Record<string, { d: number }>;
      days['/p/a'].d = today() - 3;
      ingest.saved = { v: 1, pages: days };
      await run({ sections: [revisit] });
      expect(pagesAsked()).toEqual(['/p/a']);
    });

    it('sends no date for a page when revisitDays is set, else its lastmod', async () => {
      listed(['/p/a', '2026-01-01T10:00:00Z']);
      serve('/p/a');
      await run();
      expect(ingest.items.get('/p/a')?.publishedAt).toEqual(
        new Date('2026-01-01T10:00:00Z'),
      );

      ingest = new RecordingIngest();
      await run({ sections: [{ ...SECTION, revisitDays: 2 }] });
      expect(ingest.items.get('/p/a')?.publishedAt).toBeUndefined();
    });

    it('sends no date for a lastmod that is none', async () => {
      listed(['/p/a', 'last tuesday']);
      serve('/p/a');
      await run();
      expect(ingest.items.get('/p/a')?.publishedAt).toBeUndefined();
    });
  });

  describe('request budget and signal', () => {
    it('stops at the budget, saves, and the next run goes on from the state', async () => {
      site.set('/sitemap.xml', sitemap('/p/a', '/p/b', '/p/c'));
      for (const p of ['/p/a', '/p/b', '/p/c']) serve(p);
      const env = { WEBSITE_MAX_REQUESTS: '4' };
      await run({ env });

      expect(site.asked).toEqual([
        '/robots.txt',
        '/sitemap.xml',
        '/p/a',
        '/p/b',
      ]);
      expect(Object.keys(state().pages)).toEqual(['/p/a', '/p/b']);

      site.asked = [];
      await run({ env });
      expect(site.asked).toEqual(['/robots.txt', '/sitemap.xml', '/p/c']);
      expect([...ingest.items.keys()].sort()).toEqual(['/p/a', '/p/b', '/p/c']);
    });

    it('stops on the signal and saves what it read', async () => {
      site.set('/sitemap.xml', sitemap('/p/a', '/p/b'));
      serve('/p/a');
      serve('/p/b');
      const control = new AbortController();
      const original = ingest.item.bind(ingest);
      ingest.item = async (record) => {
        control.abort(new Error('the hub lets go'));
        return original(record);
      };

      await expect(run({ signal: control.signal })).rejects.toThrow(
        'the hub lets go',
      );
      expect(pagesAsked()).toEqual(['/p/a']);
      // the hub refuses a save once it has let go: best effort
      expect(ingest.saves).toBe(0);
    });

    it('saves every 100 pages', async () => {
      const paths = Array.from({ length: 101 }, (_, i) => `/p/${i}`);
      site.set('/sitemap.xml', sitemap(...paths));
      for (const p of paths) serve(p);
      await run();
      expect(ingest.saves).toBe(2);
    }, 60_000);

    it('saves every 5 minutes of a run, too', async () => {
      site.set('/sitemap.xml', sitemap('/p/a', '/p/b', '/p/c'));
      for (const p of ['/p/a', '/p/b', '/p/c']) serve(p);
      const original = ingest.item.bind(ingest);
      ingest.item = async (record) => {
        if (record.externalId === '/p/a') later(5 * 60_000);
        return original(record);
      };
      await run();
      // after the first page, and at the end
      expect(ingest.saves).toBe(2);
    });
  });

  describe('the page', () => {
    beforeEach(() => {
      site.set('/sitemap.xml', sitemap('/p/a'));
    });

    it('is cleaned: scripts, comments, attributes, a stray comment end', async () => {
      serve(
        '/p/a',
        `<h1 class="x" onclick="evil()">Heading</h1>
         <script>alert(1)</script><style>p{}</style><noscript>n</noscript>
         <svg><circle/></svg><button>Go</button><nav>links</nav>
         <form><input></form><iframe src="x"></iframe><template><p>t</p></template>
         <!-- a comment --><p id="i" style="color:red">${TEXT} --> after</p>
         <a href="/p/b" target="_blank" class="l">link</a>`,
      );
      await run();

      const { body } = ingest.items.get('/p/a')!.raw as { body: string };
      expect(body).not.toMatch(
        /script|alert|style|svg|button|nav|form|iframe|template|comment|-->|class|onclick|id=/,
      );
      expect(body).toContain('<h1>Heading</h1>');
      expect(body).toContain('<a href="/p/b">link</a>');
      expect(body).toContain(`${TEXT}  after`);
    });

    it('is cut at 200,000 characters', async () => {
      serve('/p/a', `<p>${'x'.repeat(250_000)}</p>`);
      await run();
      const { body } = ingest.items.get('/p/a')!.raw as { body: string };
      expect(body).toHaveLength(200_000);
    });

    it('has the title up to the first separator, or its pathname', async () => {
      const titles: [string, string][] = [
        ['Algorithms – Faculty', 'Algorithms'],
        ['Databases | Faculty – News', 'Databases'],
        ['  Plain  ', 'Plain'],
        ['', '/p/a'],
      ];
      for (const [title, expected] of titles) {
        serve('/p/a', TEXT, title);
        ingest = new RecordingIngest();
        await run();
        expect(ingest.items.get('/p/a')?.title).toBe(expected);
      }
      site.set('/p/a', `<main>${TEXT}</main>`);
      ingest = new RecordingIngest();
      await run();
      expect(ingest.items.get('/p/a')?.title).toBe('/p/a');
    });

    it('sends the item with the section’s kind, course and url', async () => {
      serve('/p/a');
      await run({ sections: [{ ...SECTION, kind: 'notice' }] });
      expect(ingest.items.get('/p/a')).toMatchObject({
        externalId: '/p/a',
        course: 'courses',
        kind: 'notice',
        url: `${SITE}/p/a`,
      });
    });

    it('is marked read and nothing sent when the content is not there', async () => {
      site.set('/p/a', '<html><body><div>x</div></body></html>');
      await run();

      expect(ingest.items.size).toBe(0);
      expect(warn).toHaveBeenCalled();
      expect(state().pages['/p/a']).toMatchObject({ d: today(), f: [] });
      site.asked = [];
      await run();
      expect(pagesAsked()).toEqual([]);
    });

    it('reads the content where the section says', async () => {
      site.set(
        '/p/a',
        `<main>other</main><article class="body"><p>${TEXT}</p></article>`,
      );
      await run({ sections: [{ ...SECTION, content: 'article.body' }] });
      expect(ingest.items.get('/p/a')?.raw).toEqual({ body: `<p>${TEXT}</p>` });
    });

    it('with too little text and no document is not sent', async () => {
      serve('/p/a', '<p>too short</p>');
      await run();

      expect(ingest.items.size).toBe(0);
      expect(state().pages['/p/a']).toMatchObject({ f: [] });
      expect(ingest.removedItems).toEqual([]);
    });

    it('with too little text, but sent before, stays until a later day agrees, then is removed and left out of the next run', async () => {
      serve('/p/a');
      await run();
      expect(ingest.items.size).toBe(1);

      site.set('/sitemap.xml', sitemap(['/p/a', '2026-05-05']));
      serve('/p/a', '<p>short</p>');
      await run();
      expect(ingest.removedItems).toEqual([]);
      expect(ingest.items.size).toBe(1);
      expect(state().pages['/p/a']).toMatchObject({
        b: 1,
        a: today(),
        k: true,
      });

      // not asked again the same day
      site.asked = [];
      await run();
      expect(pagesAsked()).toEqual([]);

      later(DAY);
      await run();
      expect(ingest.removedItems).toEqual(['/p/a']);
      expect(ingest.items.size).toBe(0);
      expect(state().pages['/p/a']).toMatchObject({ f: [], k: false, b: 0 });

      site.asked = [];
      later(DAY);
      await run();
      expect(pagesAsked()).toEqual([]);
    });

    it('with its content gone, but sent before, stays until a later day agrees', async () => {
      serve('/p/a');
      await run();
      site.set('/sitemap.xml', sitemap(['/p/a', '2026-05-05']));
      site.set('/p/a', '<html><body><p>no main</p></body></html>');
      await run();
      expect(ingest.removedItems).toEqual([]);
      expect(state().pages['/p/a']).toMatchObject({ b: 1, k: true });

      later(DAY);
      await run();
      expect(ingest.removedItems).toEqual(['/p/a']);
    });

    it('five wrong-looking pages in a row stop the run', async () => {
      const paths = Array.from({ length: 8 }, (_, i) => `/p/${i}`);
      site.set('/sitemap.xml', sitemap(...paths));
      for (const p of paths) serve(p);
      await run();

      site.set(
        '/sitemap.xml',
        sitemap(...paths.map((p) => [p, '2'] as [string, string])),
      );
      for (const p of paths)
        site.set(p, '<html><body><p>no main</p></body></html>');
      site.asked = [];
      await run();
      expect(pagesAsked()).toHaveLength(5);
      expect(ingest.items.size).toBe(8);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('5 pages looked wrong'),
      );
    });

    it('is a failed page when the site answers as another page', async () => {
      serve('/p/a');
      await run();
      site.set('/sitemap.xml', sitemap(['/p/a', '2']));
      site.set('/p/a', { status: 302, headers: { location: '/login' } });
      serve('/login', '<p>Please sign in, with a long enough message.</p>');
      await run();

      expect(ingest.removedItems).toEqual([]);
      expect(ingest.items.get('/p/a')?.raw).toMatchObject({ body: `${TEXT}` });
      expect(state().pages['/p/a']).toMatchObject({ a: today() });
    });

    it('is read when the site adds or drops a trailing slash', async () => {
      site.set('/sitemap.xml', sitemap('/p/a/'));
      site.set('/p/a/', { status: 301, headers: { location: '/p/a' } });
      serve('/p/a');
      await run();
      expect(ingest.items.has('/p/a/')).toBe(true);
    });

    it('is a failed page when it can not be parsed in time', async () => {
      site.set('/sitemap.xml', sitemap('/p/a', '/p/b'));
      serve('/p/a', `<p>${TEXT}</p><a href="/d/x.pdf">${'a'.repeat(40)}!</a>`);
      serve('/p/b');
      // the section's skipFiles pattern never ends on that link text
      const real = AbortSignal.timeout.bind(AbortSignal);
      vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) =>
        real(ms === 20_000 ? 300 : ms),
      );
      await run({ sections: [{ ...withFiles, skipFiles: '^(a+)+$' }] });

      expect([...ingest.items.keys()]).toEqual(['/p/b']);
      expect(state().pages['/p/a']).toMatchObject({ a: today(), d: 0 });
    });

    it('is parsed whatever its nesting, and cut at 2 MiB first', async () => {
      const deep = TEXT + '<div>'.repeat(5_000) + '</div>'.repeat(5_000);
      serve('/p/a', deep);
      // the content starts past the 2 MiB
      site.set('/p/b', 'x'.repeat(3 * 1024 * 1024) + page(TEXT));
      site.set('/sitemap.xml', sitemap('/p/a', '/p/b'));
      await run();

      const { body } = ingest.items.get('/p/a')!.raw as { body: string };
      // 200 levels deep, no deeper
      expect(body).toContain('<div>'.repeat(200));
      expect(body).not.toContain('<div>'.repeat(201));
      expect(ingest.items.has('/p/b')).toBe(false);
      expect(state().pages['/p/b']).toMatchObject({ k: false });
    });
  });

  describe('documents', () => {
    const doc = (path: string, text = 'file') =>
      `<a href="${path}">${text}</a>`;
    beforeEach(() => {
      site.set('/sitemap.xml', sitemap('/p/a'));
      site.set('/d/one.pdf', 'ONE');
      site.set('/d/two.docx', 'TWO');
    });

    it('are the same-origin .pdf and .docx links, with their content, once each', async () => {
      serve(
        '/p/a',
        `<p>${TEXT}</p>${doc('/d/one.pdf')}${doc('/d/one.pdf#again')}${doc('/d/two.DOCX')}
         ${doc('/d/three.zip')}${doc('https://elsewhere.example.org/x.pdf')}${doc('/d/Report%20One.pdf')}`,
      );
      await run({ sections: [withFiles] });

      expect([...ingest.files.keys()].sort()).toEqual([
        '/d/Report%20One.pdf',
        '/d/one.pdf',
        '/d/two.DOCX',
      ]);
      expect(ingest.files.get('/d/one.pdf')).toMatchObject({
        course: 'courses',
        item: '/p/a',
        name: 'one.pdf',
        url: `${SITE}/d/one.pdf`,
        mime: 'application/pdf',
      });
      expect(ingest.files.get('/d/Report%20One.pdf')?.name).toBe(
        'Report One.pdf',
      );
      expect(ingest.files.get('/d/two.DOCX')?.mime).toContain(
        'wordprocessingml',
      );
      expect(ingest.contents.get('/d/one.pdf')).toBe('ONE');
      expect(site.elsewhere).toEqual([]);
      expect(state().pages['/p/a']).toMatchObject({
        f: expect.arrayContaining(['/d/one.pdf']),
      });
    });

    it('are left alone unless the section reads files', async () => {
      serve('/p/a', `<p>${TEXT}</p>${doc('/d/one.pdf')}`);
      await run();
      expect(ingest.files.size).toBe(0);
    });

    it('are dated as the page is', async () => {
      site.set('/sitemap.xml', sitemap(['/p/a', '2026-01-01']));
      serve('/p/a', `<p>${TEXT}</p>${doc('/d/one.pdf')}`);
      await run({ sections: [withFiles] });
      expect(ingest.files.get('/d/one.pdf')?.updatedAt).toEqual(
        new Date('2026-01-01'),
      );
    });

    it('skip those skipFiles names, by pathname or by link text', async () => {
      serve(
        '/p/a',
        `<p>${TEXT}</p>${doc('/d/one.pdf', 'Exam')}${doc('/d/SECRET.pdf')}${doc('/d/two.docx', 'Notes')}`,
      );
      await run({ sections: [{ ...withFiles, skipFiles: 'exam|secret' }] });
      expect([...ingest.files.keys()]).toEqual(['/d/two.docx']);
    });

    it('make a page of their own with no text to read', async () => {
      serve('/p/a', doc('/d/one.pdf'));
      await run({ sections: [withFiles] });
      expect(ingest.items.has('/p/a')).toBe(true);
    });

    it('are not fetched when the hub has them, and still sent', async () => {
      ingest.wantsContent = false;
      serve('/p/a', `<p>${TEXT}</p>${doc('/d/one.pdf')}`);
      await run({ sections: [withFiles] });

      expect(ingest.files.size).toBe(1);
      expect(site.asked).not.toContain('/d/one.pdf');
    });

    it('stay with the page that holds them', async () => {
      site.set('/sitemap.xml', sitemap('/p/a', '/p/b'));
      serve('/p/a', `<p>${TEXT}</p>${doc('/d/one.pdf')}`);
      serve(
        '/p/b',
        `<p>${TEXT} again</p>${doc('/d/one.pdf')}${doc('/d/two.docx')}`,
      );
      await run({ sections: [withFiles] });

      expect(ingest.files.get('/d/one.pdf')?.item).toBe('/p/a');
      expect(ingest.files.get('/d/two.docx')?.item).toBe('/p/b');
      expect(state().pages['/p/b']).toMatchObject({ f: ['/d/two.docx'] });
    });

    it('are removed when the page no longer links them, unless another holds them', async () => {
      site.set('/sitemap.xml', sitemap(['/p/a', '1']));
      serve('/p/a', `<p>${TEXT}</p>${doc('/d/one.pdf')}${doc('/d/two.docx')}`);
      await run({ sections: [withFiles] });

      site.set('/sitemap.xml', sitemap(['/p/a', '2']));
      serve('/p/a', `<p>${TEXT}</p>${doc('/d/two.docx')}`);
      await run({ sections: [withFiles] });
      expect(ingest.removedFiles).toEqual(['/d/one.pdf']);
      expect([...ingest.files.keys()]).toEqual(['/d/two.docx']);
    });

    it('go with their page when it is gone, unless another page links them', async () => {
      site.set('/sitemap.xml', sitemap('/p/a', '/p/b', '/p/c'));
      serve('/p/a', `<p>${TEXT}</p>${doc('/d/one.pdf')}`);
      serve('/p/b', `<p>${TEXT}</p>${doc('/d/two.docx')}`);
      serve('/p/c', `<p>${TEXT}</p>${doc('/d/two.docx')}${doc('/d/one.pdf')}`);
      await run({ sections: [withFiles] });
      expect(state().pages['/p/c']).toMatchObject({
        f: [],
        l: ['/d/two.docx', '/d/one.pdf'],
      });

      // /p/b goes: /p/c takes two.docx over, and it is not removed
      site.set('/sitemap.xml', sitemap('/p/a', '/p/c'));
      await run({ sections: [withFiles] });
      expect(ingest.removedItems).toEqual(['/p/b']);
      expect(ingest.removedFiles).toEqual([]);
      expect(ingest.files.get('/d/two.docx')?.item).toBe('/p/c');
      expect(state().pages['/p/c']).toMatchObject({ f: ['/d/two.docx'] });

      // with no page linking it, it goes
      site.set('/sitemap.xml', sitemap('/p/a'));
      await run({ sections: [withFiles] });
      expect(ingest.removedFiles).toEqual(['/d/two.docx']);
    });

    it('go to the page that still links them when their holder stops', async () => {
      site.set('/sitemap.xml', sitemap(['/p/a', '1'], ['/p/b', '1']));
      serve('/p/a', `<p>${TEXT}</p>${doc('/d/one.pdf')}`);
      serve('/p/b', `<p>${TEXT} too</p>${doc('/d/one.pdf')}`);
      await run({ sections: [withFiles] });

      site.set('/sitemap.xml', sitemap(['/p/a', '2'], ['/p/b', '1']));
      serve('/p/a', `<p>${TEXT}</p>`);
      await run({ sections: [withFiles] });
      expect(ingest.removedFiles).toEqual([]);
      expect(state().pages['/p/b']).toMatchObject({ m: null, d: 0 });

      await run({ sections: [withFiles] });
      expect(ingest.files.get('/d/one.pdf')?.item).toBe('/p/b');
      expect(ingest.removedFiles).toEqual([]);
    });

    it('are refused when the site answers with a page, and not stored', async () => {
      site.set('/sitemap.xml', sitemap('/p/a'));
      serve(
        '/p/a',
        `<p>${TEXT}</p>${doc('/d/one.pdf')}${doc('/d/two.docx')}${doc('/d/three.pdf')}`,
      );
      site.set('/d/one.pdf', {
        body: '<html>sign in</html>',
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
      site.set('/d/two.docx', { status: 302, headers: { location: '/login' } });
      site.set('/login', 'sign in');
      site.set('/d/three.pdf', 'THREE');
      await run({ sections: [withFiles] });

      expect([...ingest.contents.keys()]).toEqual(['/d/three.pdf']);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(state().pages['/p/a']).toMatchObject({ d: today() });
    });

    it('cut off partway leave the page read, and the run going', async () => {
      site.set('/sitemap.xml', sitemap('/p/a', '/p/b'));
      serve('/p/a', `<p>${TEXT}</p>${doc('/d/one.pdf')}`);
      serve('/p/b');
      site.set('/d/one.pdf', { body: 'ON', end: 'cut' });
      await run({ sections: [withFiles] });

      expect(warn).toHaveBeenCalledOnce();
      expect(ingest.contents.size).toBe(0);
      expect(state().pages['/p/a']).toMatchObject({ d: today() });
      expect(ingest.items.has('/p/b')).toBe(true);
    });

    it('have their names without control characters', async () => {
      site.set('/sitemap.xml', sitemap('/p/a'));
      serve(
        '/p/a',
        `<p>${TEXT}</p>${doc('/d/a%00b%0A.pdf')}${doc('/d/x.pdf')}`,
      );
      site.set('/d/a%00b%0A.pdf', 'A');
      site.set('/d/x.pdf', 'X');
      await run({ sections: [withFiles] });
      expect(ingest.files.get('/d/a%00b%0A.pdf')?.name).toBe('ab.pdf');
    });

    it('that fail to download or are too large leave the page read', async () => {
      site.set('/d/one.pdf', 500);
      ingest.tooLarge.add('/d/two.docx');
      serve('/p/a', `<p>${TEXT}</p>${doc('/d/one.pdf')}${doc('/d/two.docx')}`);
      await run({ sections: [withFiles] });

      expect(state().pages['/p/a']).toMatchObject({ d: today() });
      expect(ingest.files.size).toBe(2);
      expect(warn).toHaveBeenCalledTimes(2);
    });

    it('that run out of budget leave the page unread for the next run', async () => {
      serve('/p/a', `<p>${TEXT}</p>${doc('/d/one.pdf')}`);
      // robots, sitemap, the page: none left for the document
      await run({ sections: [withFiles], env: { WEBSITE_MAX_REQUESTS: '3' } });
      expect(state().pages['/p/a']).toBeUndefined();

      await run({ sections: [withFiles] });
      expect(ingest.contents.get('/d/one.pdf')).toBe('ONE');
      expect(state().pages['/p/a']).toBeDefined();
    });

    it('that robots.txt disallows are left alone', async () => {
      site.set('/robots.txt', 'User-agent: *\nDisallow: /d/');
      serve('/p/a', `<p>${TEXT}</p>${doc('/d/one.pdf')}`);
      await run({ sections: [withFiles] });
      expect(ingest.files.size).toBe(0);
    });
  });

  describe('what the site answers', () => {
    it('removes a page it answers 404 or 410 to, once a later day agrees', async () => {
      site.set('/sitemap.xml', sitemap('/p/a', '/p/b'));
      serve('/p/a');
      serve('/p/b');
      await run();

      site.set('/sitemap.xml', sitemap(['/p/a', '2'], ['/p/b', '2']));
      site.set('/p/a', 404);
      site.set('/p/b', 410);
      await run();
      expect(ingest.removedItems).toEqual([]);
      expect(state().pages['/p/a']).toMatchObject({ b: 1, k: true });

      // not asked again the same day
      site.asked = [];
      await run();
      expect(pagesAsked()).toEqual([]);

      later(DAY);
      await run();
      expect(ingest.removedItems.sort()).toEqual(['/p/a', '/p/b']);
      expect(state().pages).toEqual({});
    });

    it('stops at ten in a row, removing nothing', async () => {
      const paths = Array.from(
        { length: 12 },
        (_, i) => `/p/${String(i).padStart(2, '0')}`,
      );
      site.set('/sitemap.xml', sitemap(...paths));
      for (const p of paths) serve(p);
      await run();

      site.set(
        '/sitemap.xml',
        sitemap(...paths.map((p) => [p, '2'] as [string, string])),
      );
      for (const p of paths) site.set(p, 404);
      later(DAY);
      await run();
      site.asked = [];
      later(DAY);
      await run();
      expect(pagesAsked()).toHaveLength(10);
      expect(ingest.removedItems).toEqual([]);
      expect(ingest.items.size).toBe(12);
    });

    it('stops the run on 429 or 503, state saved', async () => {
      for (const status of [429, 503]) {
        ingest = new RecordingIngest();
        site.asked = [];
        site.set('/sitemap.xml', sitemap('/p/a', '/p/b', '/p/c'));
        serve('/p/a');
        site.set('/p/b', status);
        serve('/p/c');
        await run();

        expect(pagesAsked()).toEqual(['/p/a', '/p/b']);
        expect(Object.keys(state().pages)).toEqual(['/p/a']);
      }
    });

    it('skips other failures unread, and stops after 20 in a row', async () => {
      const paths = Array.from(
        { length: 25 },
        (_, i) => `/p/${String(i).padStart(2, '0')}`,
      );
      site.set('/sitemap.xml', sitemap(...paths));
      for (const p of paths) site.set(p, 500);
      serve('/p/00');
      await run();
      expect(pagesAsked()).toHaveLength(21);

      // the failed are not asked again that day, and the rest go on
      site.asked = [];
      serve('/p/22');
      await run();
      expect(pagesAsked()).toEqual(['/p/21', '/p/22', '/p/23', '/p/24']);
      expect(state().pages['/p/05']).toMatchObject({ a: today(), d: 0 });
    });

    it('asks a failed page again another day, after every other page', async () => {
      site.set('/sitemap.xml', sitemap('/p/a', '/p/b', '/p/c'));
      site.set('/p/a', 500);
      serve('/p/b');
      serve('/p/c');
      await run();
      expect(pagesAsked()).toEqual(['/p/a', '/p/b', '/p/c']);

      // all due again by revisit; the one that failed comes last
      ingest.saved = {
        v: 1,
        pages: {
          ...state().pages,
          '/p/b': { ...state().pages['/p/b'], d: 1 },
          '/p/c': { ...state().pages['/p/c'], d: 2 },
        },
      };
      site.asked = [];
      later(DAY);
      serve('/p/a');
      await run({ sections: [{ ...SECTION, revisitDays: 1 }] });
      expect(pagesAsked()).toEqual(['/p/b', '/p/c', '/p/a']);
      expect(state().pages['/p/a']).not.toHaveProperty('a');
    });

    it('treats a redirect to another origin, or to another page, as a failure, and follows one on the site', async () => {
      site.set('/sitemap.xml', sitemap('/p/a', '/p/b', '/p/c'));
      site.set('/p/a', {
        status: 302,
        headers: { location: 'https://elsewhere.example.org/p/x' },
      });
      site.set('/p/b', { status: 301, headers: { location: '/p/b/' } });
      serve('/p/b/');
      site.set('/p/c', { status: 301, headers: { location: '/p/d' } });
      serve('/p/d');
      await run();

      expect(site.elsewhere).toEqual([]);
      expect([...ingest.items.keys()]).toEqual(['/p/b']);
      expect(state().pages['/p/a']).toMatchObject({ d: 0, a: today() });
      expect(state().pages['/p/c']).toMatchObject({ d: 0, a: today() });
    });

    it('counts a redirect’s hop against the budget', async () => {
      site.set('/sitemap.xml', sitemap('/p/b'));
      site.set('/p/b', { status: 301, headers: { location: '/p/c' } });
      serve('/p/c');
      await run({ env: { WEBSITE_MAX_REQUESTS: '3' } });
      expect(ingest.items.size).toBe(0);
    });
  });

  describe('removals', () => {
    const paths = ['/p/a', '/p/b', '/p/c', '/p/d'];
    beforeEach(async () => {
      site.set('/sitemap.xml', sitemap(...paths));
      for (const p of paths) serve(p);
      await run();
    });

    it('take a page the sitemap no longer lists', async () => {
      site.set('/sitemap.xml', sitemap('/p/a', '/p/b', '/p/c'));
      await run();
      expect(ingest.removedItems).toEqual(['/p/d']);
      expect(Object.keys(state().pages).sort()).toEqual([
        '/p/a',
        '/p/b',
        '/p/c',
      ]);
    });

    it('take the pages a changed include no longer takes', async () => {
      await run({ sections: [{ ...SECTION, exclude: '/[cd]$' }] });
      expect(ingest.removedItems.sort()).toEqual(['/p/c', '/p/d']);
    });

    it('are held back when the sitemap lists fewer than half of what is kept', async () => {
      site.set('/sitemap.xml', sitemap('/p/a'));
      await run();
      expect(ingest.removedItems).toEqual([]);
      expect(Object.keys(state().pages)).toHaveLength(4);
      expect(warn).toHaveBeenCalled();

      site.set('/sitemap.xml', sitemap('/p/a', '/p/b'));
      await run();
      expect(ingest.removedItems.sort()).toEqual(['/p/c', '/p/d']);
    });

    it('are none for a sitemap that fails, and the section waits', async () => {
      site.set('/sitemap.xml', 500);
      await run();
      expect(ingest.removedItems).toEqual([]);
      expect(warn).toHaveBeenCalled();
      expect(Object.keys(state().pages)).toHaveLength(4);
    });

    it('leave the other sections going when one sitemap fails', async () => {
      site.set('/sitemap.xml', 500);
      site.set('/news.xml', sitemap('/p/n'));
      serve('/p/n');
      await run({
        sections: [SECTION, { id: 'news', name: 'News', sitemap: '/news.xml' }],
      });
      expect(ingest.items.get('/p/n')?.course).toBe('news');
    });

    it('count only the pages of their own section', async () => {
      site.set('/news.xml', sitemap('/p/n'));
      serve('/p/n');
      const news = { id: 'news', name: 'News', sitemap: '/news.xml' };
      await run({ sections: [SECTION, news] });
      expect(ingest.removedItems).toEqual([]);
      expect(Object.keys(state().pages)).toHaveLength(5);
    });
  });

  describe('one bad page', () => {
    it.each([
      ['an invalid record', new InvalidRecordError(['bad'])],
      ['an unknown reference', new UnknownReferenceError('/x')],
      ['a range error', new RangeError('too big')],
    ])('never ends the run: %s is a failed page', async (_, error) => {
      site.set('/sitemap.xml', sitemap('/p/a', '/p/b'));
      serve('/p/a');
      serve('/p/b');
      const original = ingest.item.bind(ingest);
      ingest.item = async (record) => {
        if (record.externalId === '/p/a') throw error;
        return original(record);
      };
      await run();

      expect([...ingest.items.keys()]).toEqual(['/p/b']);
      expect(state().pages['/p/a']).toMatchObject({ a: today(), k: false });
    });

    it('is no failure for the hub to refuse a NUL: a page with none sent is read, one with the six characters is kept', async () => {
      site.set('/sitemap.xml', sitemap('/p/a', '/p/b'));
      serve('/p/a', `<p>${TEXT} \\u0000 written out</p>`);
      serve('/p/b', `<p>${TEXT} &#0; and a real one</p>`);
      await run();
      expect(ingest.items.has('/p/a')).toBe(true);
      expect(ingest.items.has('/p/b')).toBe(true);
    });

    it('has a title without control characters, and a lastmod with some is none', async () => {
      site.set(
        '/sitemap.xml',
        '<urlset><url><loc>https://faculty.example.edu/p/a</loc><lastmod>2026-01-01&#1;</lastmod></url></urlset>',
      );
      serve('/p/a', TEXT, 'A\u0001title');
      await run();
      expect(ingest.items.get('/p/a')).toMatchObject({ title: 'A title' });
      expect(ingest.items.get('/p/a')?.publishedAt).toBeUndefined();
      expect(state().pages['/p/a']).toMatchObject({ m: null });
    });
  });

  it('gives a path two sections match to the first configured', async () => {
    site.set('/news.xml', sitemap('/p/a', '/p/n'));
    site.set('/sitemap.xml', sitemap('/p/a'));
    serve('/p/a');
    serve('/p/n');
    const news = { id: 'news', name: 'News', sitemap: '/news.xml' };
    await run({ sections: [SECTION, news] });

    expect(ingest.items.get('/p/a')?.course).toBe('courses');
    expect(ingest.items.get('/p/n')?.course).toBe('news');
    expect(site.asked.filter((p) => p === '/p/a')).toHaveLength(1);
  });

  describe('the client', () => {
    const client = (options: object = {}) =>
      new SiteClient({
        origin: SITE,
        userAgent: 'reader',
        delayMs: 0,
        maxRequests: 10,
        signal: new AbortController().signal,
        ...options,
      });

    it('gives up on a text request, its body too, past its deadline', async () => {
      site.set('/slow', { body: 'late', delay: 500 });
      await expect(
        client({ deadlineMs: 100 }).text(new URL(`${SITE}/slow`), 1024),
      ).rejects.toThrow('/slow');
    });

    it('cuts a download that sends nothing for too long, as one failed file', async () => {
      site.set('/d/hang.pdf', { body: 'ab', end: 'stall' });
      const { body } = await client({ idleMs: 200 }).stream(
        new URL(`${SITE}/d/hang.pdf`),
      );
      await expect(text(body)).rejects.toThrow('no data for');
    });
  });

  it('counts a state of a shape it does not know as none', async () => {
    site.set('/sitemap.xml', sitemap('/p/a'));
    serve('/p/a');
    ingest.saved = { v: 2, pages: 'nope' };
    await run();
    expect(ingest.items.has('/p/a')).toBe(true);
    expect(state()).toMatchObject({ v: 1 });
  });

  it('does not take a sitemap bigger than 16 MiB', async () => {
    site.set('/sitemap.xml', 'x'.repeat(16 * 1024 * 1024 + 10));
    await run();
    expect(ingest.items.size).toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});
