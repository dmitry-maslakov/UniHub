import { readPage, UnreadablePageError } from './site-page.js';

// every page starts a worker thread, seconds each on a busy CI runner
vi.setConfig({ testTimeout: 30_000 });

const URL_ = new URL('https://faculty.example.edu/courses/a');
const html = (main: string, title = 'A page') =>
  `<html><head><title>${title}</title></head><body><nav><a href="/menu">Menu</a></nav><main>${main}</main><footer><a href="/about">About</a></footer></body></html>`;
const read = (page: string, skip?: RegExp) =>
  readPage(page, URL_, { content: 'main', skip });
const paths = (page: Awaited<ReturnType<typeof read>>) =>
  page!.links.map((link) => link.url.replace(URL_.origin, ''));

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

  it('has the content’s links in order, resolved, without fragments, their text spaced', async () => {
    const page = await read(
      html(
        '<a href="b.pdf#p2"> Room\n   204 </a><nav><a href="/gone">in a menu</a></nav><a href="https://x.example.org/c">Elsewhere</a><a href="http://[">bad</a><a href="mailto:a@example.edu">mail</a><a href="javascript:void(0)">js</a><a href="">here</a><a>none</a>',
      ),
    );
    expect(page!.links).toEqual([
      { url: 'https://faculty.example.edu/courses/b.pdf', text: 'Room 204' },
      { url: 'https://x.example.org/c', text: 'Elsewhere' },
    ]);
  });

  it('leaves out the links skip matches, by pathname or text, whatever its flags', async () => {
    const page = await read(
      html(
        '<a href="/exam1.pdf">a</a><a href="/exam2.pdf">b</a><a href="/notes.pdf">Exam answers</a><a href="/keep.pdf">keep</a><a href="/exam4.pdf">c</a>',
      ),
      /exam/gi,
    );
    expect(paths(page)).toEqual(['/keep.pdf']);
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

    // the content starts past the 2 MiB
    expect(await read('x'.repeat(3 * 1024 * 1024) + html('late'))).toBeNull();
  });

  it('is unreadable when it can not be parsed in time', async () => {
    const real = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((ms) => real(ms === 20_000 ? 300 : ms));
    onTestFinished(() => timeout.mockRestore());
    // a pattern that never ends on that text
    const failing = read(
      html(`<a href="/x.pdf">${'a'.repeat(40)}!</a>`),
      /^(a+)+$/,
    );
    await expect(failing).rejects.toThrow(UnreadablePageError);
    await expect(failing).rejects.toThrow(/aborted/);
  });
});
