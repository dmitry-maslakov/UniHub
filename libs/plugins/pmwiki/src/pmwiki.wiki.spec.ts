import type { PageLink, SitePage } from '@app/plugin-sdk';
import {
  canonicalOf,
  changesIn,
  courseLinks,
  documentsIn,
  indexIn,
  isHome,
  onSites,
  pageName,
  timeOf,
  titleOf,
  wikiOf,
} from './pmwiki.wiki.js';

const SITE = 'https://faculty.example.edu';
const ANA = `${SITE}/ana/`;
const DEPT = `${SITE}/dept/`;
const hosts = new Set(['faculty.example.edu']);

// a page as the sdk's readPage gives one
const page = (
  links: (Partial<PageLink> & { url: string })[] = [],
  otherLinks: string[] = [],
  title = 'Ana Anić | Main / Teaching',
): SitePage => ({
  title,
  body: '',
  textChars: 0,
  links: links.map((link) => ({
    text: '',
    line: link.text ?? '',
    ...link,
  })),
  otherLinks,
});

describe('onSites', () => {
  it('asks a listed site over https, and nothing else', () => {
    expect(onSites(`http://faculty.example.edu/ana/x.pdf`, hosts)?.href).toBe(
      `${SITE}/ana/x.pdf`,
    );
    expect(onSites('https://elsewhere.example.org/x', hosts)).toBeNull();
  });
});

describe('canonicalOf', () => {
  it("is where most of the page's action links go, without the action", () => {
    expect(
      canonicalOf(
        page(
          [{ url: `${SITE}/ana/Other?action=edit` }],
          [
            `${SITE}/ana/Algebra/Html?action=print`,
            `http://faculty.example.edu/ana/Algebra/Html?action=edit`,
            `${SITE}/ana/Main/HomePage?action=search`,
            `${SITE}/ana/Algebra/Html?action=upload&upname=x.pdf`,
            `${SITE}/ana/Algebra/Html`,
            'https://elsewhere.example.org/x?action=print',
          ],
        ),
        hosts,
      ),
    ).toBe(`${SITE}/ana/Algebra/Html`);
  });

  it('keeps the page’s name on a wiki without clean addresses', () => {
    expect(
      canonicalOf(
        page([], [`${SITE}/wiki/pmwiki.php?n=Main.Teaching&action=print`]),
        hosts,
      ),
    ).toBe(`${SITE}/wiki/pmwiki.php?n=Main.Teaching`);
  });

  it('is null for a page with no actions, which is no wiki’s', () => {
    expect(canonicalOf(page([], [`${SITE}/about`]), hosts)).toBeNull();
  });
});

describe('wikiOf', () => {
  it('is the listed wiki that starts the address the most', () => {
    const wikis = [`${SITE}/`, ANA, DEPT];
    expect(wikiOf(`${ANA}Teaching`, wikis)).toBe(ANA);
    expect(wikiOf(`${SITE}/plain/x`, wikis)).toBe(`${SITE}/`);
    expect(wikiOf(`${SITE}/plain/x`, [ANA])).toBeNull();
  });
});

describe('titleOf', () => {
  it("is the wiki's part of the title", () => {
    expect(titleOf(page())).toBe('Ana Anić');
    expect(titleOf(page([], [], 'Just a page'))).toBe('');
  });
});

describe('changesIn', () => {
  it('has each page’s last change, as its line says it', () => {
    const changes = changesIn(
      page([
        {
          url: `${ANA}Teaching`,
          text: 'Main.Teaching',
          line: 'Main.Teaching . . . 2026-11-22 17:05 UTC+1 by ana: fixed a typo',
        },
        {
          url: `${ANA}Profiles/Ana?action=edit`,
          text: 'ana',
          line: 'Main.Teaching . . . 2026-11-22 17:05 UTC+1 by ana: fixed a typo',
        },
        {
          url: `http://faculty.example.edu/ana/Algebra/Html`,
          text: 'Algebra.Html',
          line: 'Algebra.Html . . . 2026-10-01 17:39 UTC+1',
        },
        // the same page again, older: the first is its last
        {
          url: `${ANA}Teaching`,
          text: 'Main.Teaching',
          line: 'Main.Teaching . . . 2025-01-01 10:00 UTC+1 by ana:',
        },
        { url: `${ANA}Other`, text: 'Other', line: 'see Other . . . here' },
      ]),
      hosts,
    );
    expect([...changes]).toEqual([
      [`${ANA}Teaching`, '2026-11-22 17:05 UTC+1'],
      [`${ANA}Algebra/Html`, '2026-10-01 17:39 UTC+1'],
    ]);
  });
});

describe('timeOf', () => {
  it('reads a time written as ISO’s, its offset too, and no other', () => {
    expect(timeOf('2026-11-22 17:05 UTC+1')).toEqual(
      new Date('2026-11-22T16:05:00Z'),
    );
    expect(timeOf('2026-11-22T17:05:30-02:30')).toEqual(
      new Date('2026-11-22T19:35:30Z'),
    );
    expect(timeOf('2026-11-22 17:05')).toEqual(
      new Date('2026-11-22T17:05:00Z'),
    );
    expect(timeOf('November 22, 2026, at 05:05 PM')).toBeNull();
  });
});

describe('indexIn', () => {
  it('is the page named Teaching, or the Courses group’s home', () => {
    const teaching = page([
      { url: `${ANA}Courses`, text: 'Courses' },
      { url: `${ANA}Site/Teaching`, text: 'Teaching' },
    ]);
    expect(indexIn(teaching, hosts)).toBe(`${ANA}Site/Teaching`);
    expect(
      indexIn(page([{ url: `${DEPT}Courses`, text: 'Courses' }]), hosts),
    ).toBe(`${DEPT}Courses`);
    expect(
      indexIn(page([{ url: `${ANA}Main`, text: 'Main' }]), hosts),
    ).toBeNull();
  });
});

describe('courseLinks', () => {
  it('are the pages an index links on the listed sites, each once, named by their line', () => {
    const long = `Algebra, ${'and more, '.repeat(30)}`;
    const links = courseLinks(
      page([
        {
          url: `${SITE}/~Ana/Algebra_X.html`,
          text: 'Algebra',
          line: 'Algebra, Software engineering, I year',
        },
        { url: `${SITE}/~Ana/Algebra_X.html`, text: 'again' },
        { url: `${ANA}Calculus`, text: 'Calculus', line: 'Calculus:' },
        { url: `${ANA}Logic`, text: 'Logic', line: long },
        { url: `${ANA}Calculus?action=edit`, text: 'edit' },
        { url: `${ANA}uploads/Main/slides`, text: 'slides' },
        { url: `${SITE}/books/theory.pdf`, text: 'theory' },
        { url: 'https://elsewhere.example.org/x', text: 'other' },
      ]),
      [ANA, DEPT],
      hosts,
    );
    expect(links).toEqual([
      {
        url: `${SITE}/~Ana/Algebra_X.html`,
        name: 'Algebra, Software engineering, I year',
      },
      { url: `${ANA}Calculus`, name: 'Calculus' },
      { url: `${ANA}Logic`, name: 'Logic' },
    ]);
  });
});

describe('documentsIn', () => {
  it("are what a page links in its wiki's uploads, and the documents it links elsewhere on the site", () => {
    const docs = documentsIn(
      page([
        { url: `${ANA}uploads/Algebra/Kol2_2014` },
        { url: `http://faculty.example.edu/ana/uploads/Algebra/SV%20Kol1.htm` },
        { url: `${ANA}uploads/Algebra/SV%20Kol1.htm` },
        { url: `${SITE}/~rade/notes.pdf` },
        { url: `${SITE}/~rade/notes.html` },
        { url: `${ANA}uploads/Algebra/` },
        { url: `${ANA}Algebra/Html?action=upload&upname=x.pdf` },
        { url: `${DEPT}uploads/Courses/exam.pdf` },
        { url: 'https://elsewhere.example.org/x.pdf' },
        { url: `${ANA}uploads/Algebra/bad%E0%A4%A.pdf` },
      ]),
      ANA,
      hosts,
    );
    expect(docs.map(({ path, name }) => [path, name])).toEqual([
      ['/ana/uploads/Algebra/Kol2_2014', 'Kol2_2014'],
      ['/ana/uploads/Algebra/SV%20Kol1.htm', 'SV Kol1.htm'],
      ['/~rade/notes.pdf', 'notes.pdf'],
      // a document elsewhere on the site, wherever it's from
      ['/dept/uploads/Courses/exam.pdf', 'exam.pdf'],
      ['/ana/uploads/Algebra/bad%E0%A4%A.pdf', 'bad%E0%A4%A.pdf'],
    ]);
  });
});

describe('isHome', () => {
  it("is a wiki's home page, by any of its addresses", () => {
    for (const home of ['', 'Main', 'Main/', 'Main/HomePage', 'Main/Main'])
      expect(isHome(`${ANA}${home}`, ANA)).toBe(true);
    expect(isHome(`${ANA}pmwiki.php?n=Main.HomePage`, ANA)).toBe(true);
    expect(isHome(`${ANA}Teaching`, ANA)).toBe(false);
    expect(isHome(`${ANA}Main/Teaching`, ANA)).toBe(false);
    expect(isHome(`${ANA}pmwiki.php?n=Main.Teaching`, ANA)).toBe(false);
  });
});

describe('pageName', () => {
  it('is the last part of its address', () => {
    expect(pageName(`${ANA}Teaching`)).toBe('Teaching');
    expect(pageName(`${ANA}Matemati%C4%8Dka`)).toBe('Matematička');
    expect(pageName(`${ANA}pmwiki.php?n=Main.Teaching`)).toBe('Teaching');
  });
});
