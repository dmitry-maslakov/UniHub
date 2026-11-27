import { Logger } from '@nestjs/common';
import type { MockInstance } from 'vitest';
import { PortalId } from '@app/plugin-sdk';
import { pmwikiSettings } from './pmwiki.config.js';
import { PmwikiConnector } from './pmwiki.connector.js';
import {
  ANA,
  changes,
  changesAt,
  DEPT,
  FakeSite,
  pages,
  pagesAt,
  RecordingIngest,
  SITE,
  wikiPage,
} from './pmwiki.fakes.js';

// every page starts a worker thread, seconds each on a busy CI runner
vi.setConfig({ testTimeout: 30_000 });

const site = new FakeSite().listen();
const portal = PortalId.parse('pmwiki');
const DAY = 86_400_000;

// the made-up farm's course pages, by their own addresses
const ALGEBRA = `${ANA}Algebra/Html`;
const CALCULUS = `${ANA}Calculus`;
const TEACHING = `${ANA}Teaching`;
const STATISTICS = `${DEPT}Courses/Statistics`;
const COURSES = `${DEPT}Courses`;
const id = (url: string) => url.replace('https://', '');
const file = (course: string, path: string) => `${id(course)}|${path}`;

// the stamps each page's last change has, which runs set as they go
let stamps: Record<string, string>;

// Ana's wiki lists, on its Teaching page: Algebra by another address of its
// page, Calculus, the department's Statistics, a plain page, a page on
// another site, her slides and her home page. The department's wiki has no
// Teaching page: its Courses group lists Statistics, and Ana's Algebra.
function farm() {
  stamps = {
    [TEACHING]: '2026-11-20 10:00 UTC+1',
    [ALGEBRA]: '2026-11-18 12:01 UTC+1',
    [CALCULUS]: '2026-10-01 08:30 UTC+2',
    [COURSES]: '2026-09-01 09:00 UTC+1',
    [STATISTICS]: '2026-11-23 10:01 UTC+1',
  };
  const list = (wiki: string, title: string) =>
    changes(
      title,
      wiki,
      ...Object.entries(stamps)
        .filter(([at]) => at.startsWith(wiki))
        .map(([at, time]) => [at.replace(wiki, ''), at, time] as const),
    );
  site.set(changesAt(ANA), list(ANA, 'Ana Anić'));
  site.set(changesAt(DEPT), list(DEPT, 'Department'));
  site.set(
    pagesAt(ANA),
    pages(
      'Ana Anić',
      ANA,
      ['Main', ['HomePage', 'Teaching', 'Calculus']],
      ['Algebra', ['Html']],
    ),
  );
  site.set(
    pagesAt(DEPT),
    pages('Department', DEPT, ['Courses', ['Courses', 'Statistics']]),
  );
  site.set(
    TEACHING,
    wikiPage(
      'Ana Anić',
      TEACHING,
      `<p>Current courses:</p><ul>
      <li><a class='urllink' href='${SITE}/~Ana/Algebra_X.html'>Algebra</a>, Software engineering, I year</li>
      <li><a class='wikilink' href='/ana/Calculus'>Calculus</a>, Mechanics, I year</li>
      <li><a class='urllink' href='/dept/Courses/Statistics'>Statistics</a>, Traffic, II year</li>
      <li><a class='urllink' href='/plain/notes.html'>Notes</a>, from before</li>
      <li><a class='urllink' href='https://elsewhere.example.org/x'>Other</a></li>
      </ul><p>Extra: <a href='http://faculty.example.edu/ana/uploads/Main/slides.pdf'>slides</a></p>
      <a class='wikilink' href='/ana/Main/HomePage'>Ana Home</a>`,
    ),
  );
  const algebra = wikiPage(
    'Ana Anić',
    ALGEBRA,
    `<p>FIRST TEST on Saturday, 28.11.2026.</p>
    <a href='/ana/uploads/Algebra/tasks.pdf'>Tasks</a>
    <a href='http://faculty.example.edu/ana/uploads/Algebra/results.htm'>Results</a>
    <a href='/books/theory.pdf'>Theory</a>
    <a href='/ana/Algebra/Html?action=upload&amp;upname=new.pdf'>new.pdf</a>
    <a href='/ana/uploads/Algebra/'>all</a>`,
  );
  site.set('/~Ana/Algebra_X.html', algebra);
  site.set(ALGEBRA, algebra);
  site.file('/ana/uploads/Algebra/tasks.pdf', 'TASKS');
  site.file('/ana/uploads/Algebra/results.htm', '<p>results</p>');
  site.file('/books/theory.pdf', 'THEORY');
  site.set(
    CALCULUS,
    wikiPage(
      'Ana Anić',
      CALCULUS,
      `<p>Limits.</p><a href='/ana/uploads/Main/limits.pdf'>Limits</a>`,
    ),
  );
  site.file('/ana/uploads/Main/limits.pdf', 'LIMITS');
  site.file('/ana/uploads/Main/slides.pdf', 'SLIDES');
  site.set('/plain/notes.html', '<html><body><p>Notes</p></body></html>');
  site.set(
    `${ANA}Main/HomePage`,
    wikiPage('Ana Anić', `${ANA}Main/HomePage`, '<p>Welcome</p>'),
  );
  site.set(
    COURSES,
    wikiPage(
      'Department',
      COURSES,
      `<ul><li><a class='wikilink' href='/dept/Courses/Statistics'>Statistics</a>, Traffic, II year</li>
      <li><a class='wikilink' href='/ana/Algebra/Html'>Algebra</a> for everyone</li></ul>`,
    ),
  );
  site.set(
    STATISTICS,
    wikiPage(
      'Department',
      STATISTICS,
      `<p>Exam in room A1.</p><a href='/dept/uploads/Courses/exam.pdf'>Exam</a>`,
    ),
  );
  site.file('/dept/uploads/Courses/exam.pdf', 'EXAM');
}

let ingest: RecordingIngest;
let warn: MockInstance;
beforeEach(() => {
  ingest = new RecordingIngest();
  warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  farm();
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

const run = (env: Record<string, string> = {}, signal?: AbortSignal) => {
  signal ??= new AbortController().signal;
  ingest.signal = signal;
  ingest.log.length = 0;
  site.asked = [];
  return new PmwikiConnector(
    pmwikiSettings.parse({
      PMWIKI_WIKIS: `${ANA}, ${DEPT}`,
      PMWIKI_DELAY_MS: '0',
      ...env,
    }),
  ).poll({
    connection: { portal, account: 'shared' },
    account: { kind: 'shared' },
    ingest,
    signal,
  });
};

const pagesRead = () =>
  site.requests.filter((r) => r.startsWith('GET') && !r.includes('?n='));
const heads = () => site.requests.filter((r) => r.startsWith('HEAD'));

describe('PmwikiConnector', () => {
  describe('the catalog', () => {
    it("lists each course its Teaching page links once, named by its line and its page's wiki", async () => {
      await run();

      expect(ingest.catalog).toEqual([
        {
          externalId: id(ALGEBRA),
          name: 'Algebra, Software engineering, I year (Ana Anić)',
          url: ALGEBRA,
        },
        {
          externalId: id(CALCULUS),
          name: 'Calculus, Mechanics, I year (Ana Anić)',
          url: CALCULUS,
        },
        // its own slides make the index a course
        {
          externalId: id(TEACHING),
          name: 'Teaching (Ana Anić)',
          url: TEACHING,
        },
        // named by its own wiki, not by Ana's
        {
          externalId: id(STATISTICS),
          name: 'Statistics, Traffic, II year (Department)',
          url: STATISTICS,
        },
      ]);
      // nothing asked of another site
      expect(site.agents).toEqual(new Set(['course-sync']));
    });

    it('takes the home page of the Courses group for a wiki with no Teaching page', async () => {
      await run();
      expect(pagesRead()).toContain(`GET /dept/Courses`);
      expect((ingest.saved as { wikis: object }).wikis).toMatchObject({
        [DEPT]: { index: COURSES },
      });
    });

    it('reads each page once a run, whatever links it', async () => {
      await run();
      const asked = pagesRead();
      expect(asked).toEqual([...new Set(asked)]);
      // Algebra came by Ana's other address; the department's link to it
      // is known by then
      expect(asked).toContain('GET /~Ana/Algebra_X.html');
      expect(asked).not.toContain('GET /ana/Algebra/Html');
    });

    it("keeps a wiki's courses listed while it fails", async () => {
      await run();
      site.set(changesAt(DEPT), 500);
      await run();
      expect(ingest.catalog.map((c) => c.url)).toContain(STATISTICS);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('answered 500'),
      );
    });

    it('drops a course no index links any longer, and finds a new one', async () => {
      await run();
      stamps[COURSES] = '2026-11-25 09:00 UTC+1';
      stamps[TEACHING] = '2026-11-25 09:00 UTC+1';
      site.set(
        COURSES,
        wikiPage(
          'Department',
          COURSES,
          `<ul><li><a class='wikilink' href='/dept/Courses/Logic'>Logic</a>, I year</li></ul>`,
        ),
      );
      site.set(
        TEACHING,
        wikiPage(
          'Ana Anić',
          TEACHING,
          `<ul><li><a class='wikilink' href='/ana/Calculus'>Calculus</a>, Mechanics, I year</li></ul>`,
        ),
      );
      site.set(
        `${DEPT}Courses/Logic`,
        wikiPage('Department', `${DEPT}Courses/Logic`, '<p>Logic</p>'),
      );
      farmChanges();
      await run();
      expect(ingest.catalog.map((c) => c.url)).toEqual([
        CALCULUS,
        `${DEPT}Courses/Logic`,
      ]);
    });

    it('asks again of a link the site says is not there only at a revisit', async () => {
      site.set(
        TEACHING,
        wikiPage(
          'Ana Anić',
          TEACHING,
          `<ul><li><a href='/ana/Gone'>Gone</a>, I year</li><li><a href='/ana/Calculus'>Calculus</a></li></ul>`,
        ),
      );
      const asks = () => site.requests.filter((r) => r === 'GET /ana/Gone');
      await run();
      expect(asks()).toHaveLength(1);
      stamps[TEACHING] = '2026-11-25 09:00 UTC+1';
      farmChanges();
      await run();
      // the index read again, the link known to be none
      expect(pagesRead()).toContain('GET /ana/Teaching');
      expect(asks()).toHaveLength(0);
      later(7 * DAY);
      await run();
      expect(asks()).toHaveLength(1);
    });
  });

  describe('a course', () => {
    it('is passed as its page, and its files with their size, date and type', async () => {
      await run();

      expect(ingest.items.get(id(ALGEBRA))).toEqual({
        externalId: id(ALGEBRA),
        course: id(ALGEBRA),
        kind: 'page',
        title: 'Algebra, Software engineering, I year (Ana Anić)',
        url: ALGEBRA,
        publishedAt: new Date('2026-11-18T11:01:00Z'),
        raw: { body: expect.stringContaining('FIRST TEST on Saturday') },
      });
      const files = [...ingest.files.values()].filter(
        (f) => f.course === id(ALGEBRA),
      );
      expect(files).toEqual([
        {
          externalId: file(ALGEBRA, '/ana/uploads/Algebra/tasks.pdf'),
          course: id(ALGEBRA),
          item: id(ALGEBRA),
          name: 'tasks.pdf',
          url: `${SITE}/ana/uploads/Algebra/tasks.pdf`,
          size: 5,
          mime: 'application/pdf',
          updatedAt: new Date('2022-01-25T11:34:03Z'),
        },
        // asked over https, as its wiki's site
        expect.objectContaining({
          name: 'results.htm',
          url: `${SITE}/ana/uploads/Algebra/results.htm`,
          mime: 'text/html',
        }),
        // a document elsewhere on the site
        expect.objectContaining({ name: 'theory.pdf' }),
      ]);
    });

    it('has its files’ content once every pass has ended', async () => {
      await run();
      const firstContent = ingest.log.findIndex((l) => l.startsWith('content'));
      expect(
        ingest.log
          .slice(0, firstContent)
          .every((l) => !l.startsWith('content')),
      ).toBe(true);
      expect(
        ingest.log.slice(firstContent).every((l) => l.startsWith('content')),
      ).toBe(true);
      expect(
        ingest.contents.get(file(ALGEBRA, '/ana/uploads/Algebra/tasks.pdf'))
          ?.body,
      ).toBe('TASKS');
      // an upload of a page's type is a file as it was uploaded
      expect(
        ingest.contents.get(file(ALGEBRA, '/ana/uploads/Algebra/results.htm'))
          ?.body,
      ).toBe('<p>results</p>');
      expect(
        ingest.contents.get(file(TEACHING, '/ana/uploads/Main/slides.pdf'))
          ?.body,
      ).toBe('SLIDES');
    });

    it('is read again when its page changes, else after PMWIKI_REVISIT_DAYS', async () => {
      await run();
      await run();
      // the recent changes, and nothing else
      expect(site.requests).toEqual([
        `GET ${changesAt(ANA).replace(SITE, '')}`,
        `GET ${changesAt(DEPT).replace(SITE, '')}`,
      ]);

      stamps[CALCULUS] = '2026-11-26 09:00 UTC+1';
      farmChanges();
      await run();
      expect(pagesRead()).toEqual(['GET /ana/Calculus']);
      // its file is the hub's already
      expect(heads()).toEqual(['HEAD /ana/uploads/Main/limits.pdf']);
      expect(ingest.log.filter((l) => l.startsWith('content'))).toEqual([]);

      later(7 * DAY);
      await run();
      expect(pagesRead()).toEqual(
        expect.arrayContaining(['GET /ana/Teaching', 'GET /ana/Algebra/Html']),
      );
    });

    it('fetches a file again when the site says it changed', async () => {
      await run();
      site.file(
        '/ana/uploads/Algebra/tasks.pdf',
        'TASKS v2',
        'Wed, 25 Nov 2026 10:00:00 GMT',
      );
      later(7 * DAY);
      await run();
      expect(
        ingest.contents.get(file(ALGEBRA, '/ana/uploads/Algebra/tasks.pdf'))
          ?.body,
      ).toBe('TASKS v2');
    });

    it('names gone the files its page no longer links, and those the site says are gone, but keeps those it fails on', async () => {
      await run();
      stamps[ALGEBRA] = '2026-11-26 09:00 UTC+1';
      farmChanges();
      site.set(
        ALGEBRA,
        wikiPage(
          'Ana Anić',
          ALGEBRA,
          `<p>Second test soon.</p>
          <a href='/ana/uploads/Algebra/tasks.pdf'>Tasks</a>
          <a href='/ana/uploads/Algebra/results.htm'>Results</a>`,
        ),
      );
      site.set('/ana/uploads/Algebra/tasks.pdf', 500);
      site.set('/ana/uploads/Algebra/results.htm', 404);
      await run();

      expect(ingest.gone.sort()).toEqual(
        [
          file(ALGEBRA, '/ana/uploads/Algebra/results.htm'),
          file(ALGEBRA, '/books/theory.pdf'),
        ].sort(),
      );
      expect(ingest.views.get(id(ALGEBRA))).toEqual(
        new Set([file(ALGEBRA, '/ana/uploads/Algebra/tasks.pdf')]),
      );
    });

    it('takes no page in a file’s place outside the uploads', async () => {
      site.set('/books/theory.pdf', '<html>log in</html>');
      await run();
      expect(ingest.files.has(file(ALGEBRA, '/books/theory.pdf'))).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        '/books/theory.pdf: answered with a page',
      );
    });

    it('answered as another page is tried again another day, its files kept', async () => {
      await run();
      stamps[ALGEBRA] = '2026-11-26 09:00 UTC+1';
      farmChanges();
      site.set(
        ALGEBRA,
        wikiPage('Ana Anić', `${ANA}Site/Login`, '<p>Log in to read this</p>'),
      );
      await run();
      expect(ingest.gone).toEqual([]);
      expect(ingest.views.get(id(ALGEBRA))?.size).toBe(3);
      expect(warn).toHaveBeenCalledWith(
        `/ana/Algebra/Html: answered as ${ANA}Site/Login`,
      );
    });

    it('keeps its downloads due when the run stops after its pass', async () => {
      await run();
      stamps[CALCULUS] = '2026-11-26 09:00 UTC+1';
      stamps[STATISTICS] = '2026-11-26 09:00 UTC+1';
      farmChanges();
      site.set(
        CALCULUS,
        wikiPage(
          'Ana Anić',
          CALCULUS,
          `<p>Limits.</p><a href='/ana/uploads/Main/limits.pdf'>Limits</a><a href='/ana/uploads/Main/series.pdf'>Series</a>`,
        ),
      );
      site.file('/ana/uploads/Main/series.pdf', 'SERIES');
      site.set(STATISTICS, 503);
      await run();
      const series = file(CALCULUS, '/ana/uploads/Main/series.pdf');
      expect(ingest.files.has(series)).toBe(true);
      expect(ingest.contents.has(series)).toBe(false);

      site.set(
        STATISTICS,
        wikiPage('Department', STATISTICS, '<p>Exam in room B2.</p>'),
      );
      await run();
      expect(ingest.contents.get(series)?.body).toBe('SERIES');
    });

    it('that fails is tried again another day, the others read', async () => {
      site.set(CALCULUS, 500);
      await run();
      expect(ingest.items.has(id(CALCULUS))).toBe(false);
      expect(ingest.items.has(id(ALGEBRA))).toBe(true);

      site.set(CALCULUS, wikiPage('Ana Anić', CALCULUS, '<p>Limits.</p>'));
      await run();
      expect(ingest.items.has(id(CALCULUS))).toBe(false);
      later(DAY);
      await run();
      expect(ingest.items.has(id(CALCULUS))).toBe(true);
    });
  });

  describe('the run', () => {
    it('passes as many files as fit in its requests, those the hub lacks first, and the next run goes on', async () => {
      await run({ PMWIKI_MAX_REQUESTS: '16' });
      expect(site.asked.length).toBeLessThanOrEqual(16);
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(
          /of its \d+ files wait for the next run's requests/,
        ),
      );
      for (let runs = 0; runs < 5 && ingest.contents.size < 6; runs++)
        await run({ PMWIKI_MAX_REQUESTS: '16' });
      expect(ingest.items.size).toBe(4);
      expect(ingest.contents.size).toBe(6);
      // nothing named gone on the way
      expect(ingest.gone).toEqual([]);

      // all of it in: a run then asks only what changed
      await run({ PMWIKI_MAX_REQUESTS: '16' });
      expect(site.requests).toHaveLength(2);
    });

    it('stops on 429 or 503, in the catalog or a course, its state saved', async () => {
      site.set(CALCULUS, 503);
      await run();
      expect(warn).toHaveBeenCalledWith(
        'the site answered 503: the next run goes on',
      );
      expect(ingest.saved).toMatchObject({ v: 1 });

      site.set(CALCULUS, wikiPage('Ana Anić', CALCULUS, '<p>Limits.</p>'));
      later(DAY);
      await run();
      stamps[ALGEBRA] = '2026-11-26 09:00 UTC+1';
      farmChanges();
      site.set('/ana/uploads/Algebra/tasks.pdf', 429);
      await run();
      expect(warn).toHaveBeenCalledWith(
        'the site answered 429: the next run goes on',
      );
      // what it held stays
      expect(ingest.gone).toEqual([]);
    });

    it("leaves a site's wikis as they were when its robots.txt can't be read, and stops on its 503", async () => {
      await run();
      site.set('/robots.txt', 500);
      later(7 * DAY);
      await run();
      expect(ingest.catalog).toHaveLength(4);
      expect(warn).toHaveBeenCalledWith(
        `${ANA}: robots.txt: the site answered 500`,
      );
      site.set('/robots.txt', 503);
      await run();
      expect(warn).toHaveBeenCalledWith(
        'the site answered 503: the next run goes on',
      );
    });

    it(
      'gets many courses in over runs of few requests, never past them nor eating their downloads',
      { timeout: 120_000 },
      async () => {
        const wiki = many(8);
        const asked: number[] = [];
        for (let runs = 0; runs < 25 && ingest.contents.size < 16; runs++) {
          await run({ PMWIKI_WIKIS: wiki, PMWIKI_MAX_REQUESTS: '8' });
          asked.push(site.asked.length);
        }
        expect(Math.max(...asked)).toBeLessThanOrEqual(8);
        expect(ingest.catalog).toHaveLength(8);
        expect(ingest.items.size).toBe(8);
        expect(ingest.contents.size).toBe(16);
        expect(ingest.gone).toEqual([]);
      },
    );

    it('leaves alone what robots.txt disallows', async () => {
      site.set('/robots.txt', 'User-agent: *\nDisallow: /books/');
      await run();
      expect(site.requests.some((r) => r.includes('/books/'))).toBe(false);
      expect(ingest.files.has(file(ALGEBRA, '/books/theory.pdf'))).toBe(false);
    });

    it('stops on the signal, and saves nothing once the hub let go of it', async () => {
      const stop = new AbortController();
      stop.abort(new Error('time is up'));
      await expect(run({}, stop.signal)).rejects.toThrow('time is up');
      expect(ingest.saves).toBe(0);
    });

    it('counts a state of a shape it does not know as none', async () => {
      ingest.saved = { v: 2, wikis: 'nope' };
      await run();
      expect(ingest.items.size).toBe(4);
      expect(ingest.saved).toMatchObject({ v: 1 });
    });
  });
});

// the recent changes again, as the stamps now say
function farmChanges() {
  const list = (wiki: string, title: string) =>
    changes(
      title,
      wiki,
      ...Object.entries(stamps)
        .filter(([at]) => at.startsWith(wiki))
        .map(([at, time]) => [at.replace(wiki, ''), at, time] as const),
    );
  site.set(changesAt(ANA), list(ANA, 'Ana Anić'));
  site.set(changesAt(DEPT), list(DEPT, 'Department'));
}

// A wiki of `count` courses on its Teaching page, each a page with two
// files
function many(count: number) {
  const wiki = `${SITE}/many/`;
  const courses = Array.from({ length: count }, (_, i) => `${wiki}C${i}`);
  const time = '2026-11-20 10:00 UTC+1';
  site.set(
    changesAt(wiki),
    changes(
      'Many',
      wiki,
      ['Main.Teaching', `${wiki}Teaching`, time],
      ...courses.map((c) => [`Main.${c.replace(wiki, '')}`, c, time] as const),
    ),
  );
  site.set(pagesAt(wiki), pages('Many', wiki, ['Main', ['Teaching']]));
  site.set(
    `${wiki}Teaching`,
    wikiPage(
      'Many',
      `${wiki}Teaching`,
      `<ul>${courses.map((c, i) => `<li><a href='${c}'>Course ${i}</a></li>`).join('')}</ul>`,
    ),
  );
  for (const [i, c] of courses.entries()) {
    site.set(
      c,
      wikiPage(
        'Many',
        c,
        `<p>Course ${i}</p><a href='/many/uploads/C${i}/a.pdf'>a</a><a href='/many/uploads/C${i}/b.pdf'>b</a>`,
      ),
    );
    site.file(`/many/uploads/C${i}/a.pdf`, `A${i}`);
    site.file(`/many/uploads/C${i}/b.pdf`, `B${i}`);
  }
  return wiki;
}
