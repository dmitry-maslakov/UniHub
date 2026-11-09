import { Logger } from '@nestjs/common';
import type { MockInstance } from 'vitest';
import { PortalId } from '@app/plugin-sdk';
import { websiteSettings } from './website.config.js';
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
afterEach(() => vi.restoreAllMocks());

interface Options {
  sections?: object[];
  env?: Record<string, string>;
  signal?: AbortSignal;
}
const run = ({ sections = [SECTION], env = {}, signal }: Options = {}) =>
  new WebsiteConnector(
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
    signal: signal ?? new AbortController().signal,
  });

const state = () => ingest.saved as { pages: Record<string, unknown> };
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
      expect(ingest.saves).toBeGreaterThan(0);
    });

    it('saves every 100 pages', async () => {
      const paths = Array.from({ length: 101 }, (_, i) => `/p/${i}`);
      site.set('/sitemap.xml', sitemap(...paths));
      for (const p of paths) serve(p);
      await run();
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

    it('with too little text, but sent before, is removed and kept out of the next run', async () => {
      serve('/p/a');
      await run();
      expect(ingest.items.size).toBe(1);

      site.set('/sitemap.xml', sitemap(['/p/a', '2026-05-05']));
      serve('/p/a', '<p>short</p>');
      await run();
      expect(ingest.removedItems).toEqual(['/p/a']);
      expect(ingest.items.size).toBe(0);
      expect(state().pages['/p/a']).toMatchObject({ f: [] });

      site.asked = [];
      await run();
      expect(pagesAsked()).toEqual([]);
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

    it('go with their page when it is gone, unless another page holds them', async () => {
      site.set('/sitemap.xml', sitemap('/p/a', '/p/b', '/p/c'));
      serve('/p/a', `<p>${TEXT}</p>${doc('/d/one.pdf')}`);
      serve('/p/b', `<p>${TEXT}</p>${doc('/d/two.docx')}`);
      serve('/p/c', `<p>${TEXT}</p>${doc('/d/two.docx')}${doc('/d/one.pdf')}`);
      await run({ sections: [withFiles] });

      site.set('/sitemap.xml', sitemap('/p/a', '/p/c'));
      await run({ sections: [withFiles] });
      expect(ingest.removedItems).toEqual(['/p/b']);
      expect(ingest.removedFiles).toEqual(['/d/two.docx']);
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
    it('removes a page it answers 404 or 410 to', async () => {
      site.set('/sitemap.xml', sitemap('/p/a', '/p/b'));
      serve('/p/a');
      serve('/p/b');
      await run();

      site.set('/sitemap.xml', sitemap(['/p/a', '2'], ['/p/b', '2']));
      site.set('/p/a', 404);
      site.set('/p/b', 410);
      await run();
      expect(ingest.removedItems.sort()).toEqual(['/p/a', '/p/b']);
      expect(state().pages).toEqual({});
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

      // a good page between them starts the count again
      ingest = new RecordingIngest();
      site.asked = [];
      serve('/p/10');
      await run();
      expect(Object.keys(state().pages).sort()).toEqual(['/p/00', '/p/10']);
      expect(pagesAsked()).toHaveLength(25);
    });

    it('treats a redirect to another origin as a failure, and follows one on the site', async () => {
      site.set('/sitemap.xml', sitemap('/p/a', '/p/b'));
      site.set('/p/a', {
        status: 302,
        headers: { location: 'https://elsewhere.example.org/p/x' },
      });
      site.set('/p/b', { status: 301, headers: { location: '/p/c' } });
      serve('/p/c');
      await run();

      expect(site.elsewhere).toEqual([]);
      expect([...ingest.items.keys()]).toEqual(['/p/b']);
      expect(state().pages['/p/a']).toBeUndefined();
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
