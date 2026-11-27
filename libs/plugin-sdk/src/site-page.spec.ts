import { readPage, UnreadablePageError } from './site-page.js';

// every page starts a worker thread, seconds each on a busy CI runner
vi.setConfig({ testTimeout: 30_000 });

const URL_ = new URL('https://faculty.example.edu/courses/a');
const html = (main: string, title = 'A page', around = '') =>
  `<html><head><title>${title}</title></head><body><nav><a href="/menu">Menu</a></nav>${around}<main>${main}</main><footer><a href="/about#team">About</a></footer></body></html>`;
const read = (page: string, skip?: RegExp) =>
  readPage(page, URL_, { content: 'main', skip });

describe('readPage', () => {
  it('cleans the content of scripts, styles, navigation, forms, comments and attributes', async () => {
    const page = await read(
      html(`<h1 class="x" onclick="evil()">Heading</h1>
        <script>alert(1)</script><style>p{}</style><noscript>n</noscript>
        <svg><circle/></svg><button>Go</button><nav>links</nav>
        <form><input></form><iframe src="x"></iframe><template><p>t</p></template>
        <!-- a comment --><p id="i" style="color:red">Notes --> after</p>
        <a href="/p/b" target="_blank" class="l">link</a>`),
    );

    expect(page!.body).not.toMatch(
      /script|alert|style|svg|button|nav|form|iframe|template|comment|-->|class|onclick|id=/,
    );
    expect(page!.body).toContain('<h1>Heading</h1>');
    expect(page!.body).toContain('<a href="/p/b">link</a>');
    expect(page!.body).toContain('Notes  after');
    expect(page!.textChars).toBe('HeadingNotesafterlink'.length);
  });

  it('has its text a line per block, spaces one', async () => {
    const page = await read(
      `<main><h2>Exams</h2><p>First  test:
         Saturday</p><ul><li>Room <b>A1</b></li><li>Room 204</li></ul><table><tr><td>1</td><td>Ana</td></tr></table>line<br>break</main>`,
    );
    expect(page!.text).toBe(
      'Exams\nFirst test: Saturday\nRoom A1\nRoom 204\n1\nAna\nline\nbreak',
    );
  });

  it('has the content’s links in order, then the rest of the page’s, resolved and without fragments', async () => {
    const page = await read(
      html(
        '<a href="b.pdf#p2"> Slides </a><nav><a href="/gone">in a menu</a></nav><a href="https://x.example.org/c">Elsewhere</a><a href="http://[">bad</a><a>none</a>',
        'A page',
        '<a href="?action=print">Print</a>',
      ),
    );
    expect(page!.links).toEqual([
      {
        url: 'https://faculty.example.edu/courses/b.pdf',
        text: 'Slides',
        inContent: true,
      },
      { url: 'https://x.example.org/c', text: 'Elsewhere', inContent: true },
      {
        url: 'https://faculty.example.edu/menu',
        text: 'Menu',
        inContent: false,
      },
      {
        url: 'https://faculty.example.edu/courses/a?action=print',
        text: 'Print',
        inContent: false,
      },
      {
        url: 'https://faculty.example.edu/about',
        text: 'About',
        inContent: false,
      },
    ]);
  });

  it('leaves out the content’s links that skip matches, by pathname or text', async () => {
    const page = await read(
      html(
        '<a href="/exam.pdf">a</a><a href="/notes.pdf">Exam answers</a><a href="/keep.pdf">keep</a>',
        'A page',
        '<a href="/exam-menu">exam</a>',
      ),
      /exam/i,
    );
    expect(page!.links.map((l) => l.url.replace(URL_.origin, ''))).toEqual([
      '/keep.pdf',
      '/menu',
      '/exam-menu',
      '/about',
    ]);
  });

  it('has the title with its control characters spaces, trimmed', async () => {
    const page = await read(html('x', '  Algebra\u0007| Faculty  '));
    expect(page!.title).toBe('Algebra | Faculty');
  });

  it('is null when the content is not there', async () => {
    expect(await read('<html><body><p>no main</p></body></html>')).toBeNull();
  });

  it('is parsed whatever its nesting, cut at 200,000 characters, and read from its first 2 MiB', async () => {
    const deep = await read(
      html('x' + '<div>'.repeat(5_000) + '</div>'.repeat(5_000)),
    );
    // 200 levels deep, no deeper
    expect(deep!.body).toContain('<div>'.repeat(200));
    expect(deep!.body).not.toContain('<div>'.repeat(201));

    const long = await read(html(`<p>${'x'.repeat(250_000)}</p>`));
    expect(long!.body).toHaveLength(200_000);
    expect(long!.text).toHaveLength(200_000);

    // the content starts past the 2 MiB
    expect(await read('x'.repeat(3 * 1024 * 1024) + html('late'))).toBeNull();
  });

  it('is unreadable when it can not be parsed in time', async () => {
    const real = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) =>
      real(ms === 20_000 ? 300 : ms),
    );
    // a pattern that never ends on that text
    await expect(
      read(html(`<a href="/x.pdf">${'a'.repeat(40)}!</a>`), /^(a+)+$/),
    ).rejects.toThrow(UnreadablePageError);
    vi.restoreAllMocks();
  });
});
