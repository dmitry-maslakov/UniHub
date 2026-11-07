import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/shared/i18n';
import { leaveTo } from '@/shared/lib';
import { renderApp } from './render';
import { server, signedIn } from './server';

// the page stays; the browser is sent to the zip
vi.mock('@/shared/lib/leave', () => ({ leaveTo: vi.fn() }));

const api = (path: string) => `http://localhost:3000/api${path}`;

const post = (n: number, raw: object | null = {}) => ({
  id: `i${n}`,
  portal: 'canvas',
  kind: 'announcement',
  title: `Post ${n}`,
  url: null,
  publishedAt: '2026-11-01T10:00:00.000Z',
  raw,
});

const file = (n: number, hasContent = true, path = 'lectures') => ({
  id: `f${n}`,
  portal: 'canvas',
  itemId: null,
  name: `file-${n}.pdf`,
  path,
  url: null,
  size: 1_400_000,
  mime: 'application/pdf',
  changedAt: null as string | null,
  hasContent,
});

const posts = Array.from({ length: 51 }, (_, i) => post(i + 1));
const offsets: number[] = [];
const fileOffsets: number[] = [];

const setup = (items: unknown[] = posts, files: unknown[] = [file(1)]) => {
  signedIn();
  offsets.length = 0;
  fileOffsets.length = 0;
  server.use(
    http.get(api('/courses'), () =>
      HttpResponse.json([
        {
          slug: 'os',
          name: 'Operating systems',
          sources: [],
          portalCourses: [],
        },
      ]),
    ),
    http.get(api('/courses/os/items'), ({ request }) => {
      const offset = Number(
        new URL(request.url).searchParams.get('offset') ?? 0,
      );
      offsets.push(offset);
      return HttpResponse.json(items.slice(offset, offset + 50));
    }),
    http.get(api('/courses/os/files'), ({ request }) => {
      const query = new URL(request.url).searchParams;
      const offset = Number(query.get('offset') ?? 0);
      const limit = Number(query.get('limit') ?? 50);
      fileOffsets.push(offset);
      return HttpResponse.json(files.slice(offset, offset + limit));
    }),
    http.get(api('/me/portals'), () => HttpResponse.json([])),
  );
};

const manyFiles = (n: number) =>
  Array.from({ length: n }, (_, i) => file(i + 1, true, `folder ${i % 3}`));

describe('a course', () => {
  it('opens on Files with the folders of a course that has files', async () => {
    setup(posts, [file(1, true, 'Predavanja'), file(2, true, 'Vežbe')]);
    const { router } = renderApp('/courses/os');

    expect(
      await screen.findByRole('tab', { name: 'Files (2)', selected: true }),
    ).toBeVisible();
    const tree = screen.getByRole('navigation', { name: 'Files by folder' });
    expect(within(tree).getByText('Predavanja')).toBeVisible();
    expect(within(tree).getByText('Vežbe')).toBeVisible();
    // Files come first
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Files (2)',
      'Posts',
    ]);
    expect(screen.queryByText('Post 1')).toBeNull();
    expect(router.state.location.search).toEqual({});
  });

  it('opens on Posts for a course without files', async () => {
    setup(posts, []);
    renderApp('/courses/os');

    expect(
      await screen.findByRole('tab', { name: 'Posts', selected: true }),
    ).toBeVisible();
    expect(await screen.findByText('Post 1')).toBeVisible();
  });

  it('keeps the tab chosen in the address', async () => {
    setup();
    const { router } = renderApp('/courses/os');

    await userEvent.click(await screen.findByRole('tab', { name: 'Posts' }));
    expect(await screen.findByText('Post 1')).toBeVisible();
    expect(router.state.location.search).toEqual({ tab: 'posts' });

    await userEvent.click(screen.getByRole('tab', { name: /^Files/ }));
    expect(router.state.location.search).toEqual({ tab: 'files' });
  });

  it('shows its posts newest first, each linking to its page', async () => {
    setup();
    renderApp('/courses/os?tab=posts');

    const list = await screen.findByRole('list', { name: 'Posts' });
    const link = within(list).getByRole('link', { name: /Post 1\b/ });
    expect(link).toHaveAttribute('href', '/courses/os/posts/i1');
    expect(link).toHaveTextContent(/Announcement · Nov 1, 2026/);
    // the portal's own link isn't on the row any more
    expect(within(list).queryByText(/On /)).toBeNull();
  });

  it('pages through posts on request', async () => {
    setup();
    renderApp('/courses/os?tab=posts');

    expect(await screen.findByText('Post 50')).toBeVisible();
    expect(screen.queryByText('Post 51')).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Show more posts' }),
    );

    expect(await screen.findByText('Post 51')).toBeVisible();
    expect(offsets).toEqual([0, 50]);
    expect(
      screen.queryByRole('button', { name: 'Show more posts' }),
    ).toBeNull();
  });

  it('says when the next page of posts fails, and loads it on retry', async () => {
    setup();
    let failing = true;
    server.use(
      http.get(api('/courses/os/items'), ({ request }) => {
        const offset = Number(
          new URL(request.url).searchParams.get('offset') ?? 0,
        );
        return offset > 0 && failing
          ? HttpResponse.json({ statusCode: 500 }, { status: 403 })
          : HttpResponse.json(posts.slice(offset, offset + 50));
      }),
    );
    renderApp('/courses/os?tab=posts');
    expect(await screen.findByText('Post 50')).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Show more posts' }),
    );

    expect(
      await screen.findByText("Couldn't load this", {}, { timeout: 8000 }),
    ).toBeVisible();
    expect(screen.getByText('Post 50')).toBeVisible();
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Post 51')).toBeVisible();
  }, 20000);

  it('shows files as folders on the Files tab, and opens one in its page', async () => {
    setup(posts, [
      file(1, true, 'Predavanja/2026'),
      { ...file(2), path: 'Predavanja', name: 'plan.pdf' },
      { ...file(3), path: '', name: 'ispit.pdf', mime: null, size: 2300 },
    ]);
    renderApp('/courses/os?tab=files');

    const tree = await screen.findByRole('navigation', {
      name: 'Files by folder',
    });
    expect(screen.getByText('3 files')).toBeVisible();
    const folder = within(tree).getByText('Predavanja');
    expect(within(tree).getByText('2 files')).toBeVisible();
    // the top level starts open, the folders in it closed
    const sub = within(tree).getByText('2026');
    expect(sub).toBeVisible();
    expect(within(tree).getByRole('link', { name: /plan\.pdf/ })).toBeVisible();
    await userEvent.click(sub);
    expect(
      await within(tree).findByRole('link', { name: /file-1\.pdf/ }),
    ).toHaveAttribute('href', '/courses/os/files/f1');
    expect(
      within(tree).getByRole('link', { name: /ispit\.pdf/ }),
    ).toHaveTextContent('2.3 kB');
    // folders first, then the files of the top
    const names = within(tree)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(names.at(-1)).toMatch(/ispit\.pdf/);
    await userEvent.click(folder);
    expect(within(tree).queryByText('2026')).not.toBeVisible();
  });

  it('starts the folders closed past eight', async () => {
    setup(
      posts,
      Array.from({ length: 9 }, (_, i) => file(i + 1, true, `folder ${i}`)),
    );
    renderApp('/courses/os');

    const tree = await screen.findByRole('navigation', {
      name: 'Files by folder',
    });
    expect(within(tree).getByText('folder 0')).toBeVisible();
    expect(within(tree).getAllByText('1 file')).toHaveLength(9);
    expect(
      within(tree).queryByRole('link', { name: /file-1\.pdf/ }),
    ).toBeNull();
    // a folder is a button the keyboard reaches
    const folder = within(tree).getByRole('button', {
      name: /folder 1/,
      expanded: false,
    });
    for (let i = 0; i < 20 && document.activeElement !== folder; i++)
      await userEvent.tab();
    expect(folder).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(
      await within(tree).findByRole('link', { name: /file-2\.pdf/ }),
    ).toBeVisible();
  });

  it('opens the top level when there are eight folders, and remembers what the user opens and closes', async () => {
    setup(
      posts,
      Array.from({ length: 8 }, (_, i) => file(i + 1, true, `folder ${i}`)),
    );
    renderApp('/courses/os');

    const tree = await screen.findByRole('navigation', {
      name: 'Files by folder',
    });
    expect(
      within(tree).getByRole('link', { name: /file-1\.pdf/ }),
    ).toBeVisible();
    await userEvent.click(within(tree).getByText('folder 0'));
    expect(
      within(tree).getByRole('link', { name: /file-1\.pdf/, hidden: true }),
    ).not.toBeVisible();
    expect(JSON.parse(localStorage.getItem('unihub.course.os.open')!)).toEqual([
      'folder 1',
      'folder 2',
      'folder 3',
      'folder 4',
      'folder 5',
      'folder 6',
      'folder 7',
    ]);

    // the course opened again keeps it, and another course starts afresh
    cleanup();
    renderApp('/courses/os');
    const again = await screen.findByRole('navigation', {
      name: 'Files by folder',
    });
    expect(
      within(again).getByRole('link', { name: /file-1\.pdf/, hidden: true }),
    ).not.toBeVisible();
    expect(
      within(again).getByRole('link', { name: /file-2\.pdf/ }),
    ).toBeVisible();
  });

  it('works when the browser keeps nothing', async () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    try {
      setup(posts, [file(1, true, 'Predavanja')]);
      renderApp('/courses/os');

      const tree = await screen.findByRole('navigation', {
        name: 'Files by folder',
      });
      await userEvent.click(within(tree).getByText('Predavanja'));
      expect(
        within(tree).getByRole('link', { name: /file-1\.pdf/, hidden: true }),
      ).not.toBeVisible();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('opens an archive in the tree and reads a member', async () => {
    setup(posts, [
      { ...file(1, true, ''), name: 'lab.zip', mime: 'application/zip' },
    ]);
    const asked: string[] = [];
    server.use(
      http.get(api('/files/f1/members'), ({ request }) => {
        asked.push(request.url);
        return HttpResponse.json([
          {
            path: 'src/main.c',
            size: 900,
            mime: 'text/x-c',
            leftOut: null,
            texts: [{ processor: 'plain-text', version: 1, pages: 1 }],
          },
        ]);
      }),
    );
    const { router } = renderApp('/courses/os');

    const tree = await screen.findByRole('navigation', {
      name: 'Files by folder',
    });
    // a row that opens, not a link; members are not asked for until then
    const row = within(tree).getByRole('button', { name: /^lab\.zip/ });
    expect(within(tree).queryByRole('link', { name: /^lab\.zip/ })).toBeNull();
    expect(asked).toEqual([]);
    expect(
      within(tree).getByRole('link', { name: 'Download lab.zip' }),
    ).toHaveAttribute('href', '/api/files/f1/content');
    expect(
      within(tree).getByRole('checkbox', { name: 'Select lab.zip' }),
    ).toBeVisible();

    await userEvent.click(row);
    const member = await within(tree).findByRole('link', { name: /main\.c/ });
    expect(asked).toHaveLength(1);
    expect(member).toHaveAttribute(
      'href',
      '/courses/os/files/f1?member=src%2Fmain.c',
    );
    expect(within(tree).getByText('src')).toBeVisible();

    await userEvent.click(member);
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ member: 'src/main.c' }),
    );
    expect(router.state.location.pathname).toBe('/courses/os/files/f1');
  });

  it('says when nothing inside an archive could be read, and when it fails', async () => {
    setup(posts, [
      { ...file(1, true, ''), name: 'lab.zip', mime: 'application/zip' },
    ]);
    let fail = true;
    server.use(
      http.get(api('/files/f1/members'), () =>
        fail ? HttpResponse.json({}, { status: 403 }) : HttpResponse.json([]),
      ),
    );
    renderApp('/courses/os');

    const tree = await screen.findByRole('navigation', {
      name: 'Files by folder',
    });
    await userEvent.click(
      within(tree).getByRole('button', { name: /^lab\.zip/ }),
    );
    const retry = await within(tree).findByRole('button', {
      name: 'Try again',
    });
    fail = false;
    await userEvent.click(retry);
    expect(
      await within(tree).findByText('Nothing inside could be read.'),
    ).toBeVisible();
  });

  it('keeps an archive open as it was left, asking for its members at once', async () => {
    setup(posts, [
      { ...file(1, true, ''), name: 'lab.zip', mime: 'application/zip' },
    ]);
    localStorage.setItem('unihub.course.os.open', '["f1"]');
    let asked = 0;
    server.use(
      http.get(api('/files/f1/members'), () => {
        asked += 1;
        return HttpResponse.json([]);
      }),
    );
    renderApp('/courses/os');

    expect(
      await screen.findByText('Nothing inside could be read.'),
    ).toBeVisible();
    expect(asked).toBe(1);
  });

  it('keeps an archive without content a plain row', async () => {
    setup(posts, [
      { ...file(1, false, ''), name: 'lab.zip', mime: 'application/zip' },
    ]);
    renderApp('/courses/os');

    const tree = await screen.findByRole('navigation', {
      name: 'Files by folder',
    });
    expect(within(tree).getByRole('link', { name: /^lab\.zip/ })).toBeVisible();
    expect(within(tree).queryByRole('button')).toBeNull();
  });

  it('reads every page of files, up to 2,000', async () => {
    setup(posts, manyFiles(450));
    renderApp('/courses/os');

    expect(
      await screen.findByRole('tab', { name: 'Files (450)' }),
    ).toBeVisible();
    // two full pages, then a short one that ends it
    expect(fileOffsets).toEqual([0, 200, 400]);
    expect(screen.queryByText(/Showing the first/)).toBeNull();
  });

  it('stops at 2,000 files, and says so', async () => {
    setup(posts, manyFiles(2100));
    renderApp('/courses/os');

    expect(await screen.findByText(/Showing the first 2,000/)).toBeVisible();
    expect(fileOffsets).toHaveLength(10);
    // a count that may be short isn't put on the tab
    expect(screen.getByRole('tab', { name: 'Files' })).toBeVisible();
  }, 20_000);

  it('says a locked post and a file without content are not available yet', async () => {
    setup([post(1, null)], [file(1, false), file(2)]);
    renderApp('/courses/os?tab=posts');

    expect(
      await screen.findByText(/Announcement.*Not available yet/),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('tab', { name: /^Files/ }));
    expect(
      await screen.findByText(/1\.4 MB · Not available yet/),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says there is nothing in a tab with nothing in it', async () => {
    setup([], []);
    renderApp('/courses/os?tab=files');

    expect(await screen.findByText('No files yet')).toBeVisible();
    await userEvent.click(screen.getByRole('tab', { name: 'Posts' }));
    expect(await screen.findByText('No posts yet')).toBeVisible();
  });

  describe('downloading several files', () => {
    const asked: unknown[] = [];
    const zipAnswer = () =>
      HttpResponse.json(
        {
          url: '/api/downloads/abc',
          name: 'Operating systems.zip',
          count: 3,
          size: 4_200_000,
        },
        { status: 201 },
      );
    const answerWith = (answer: () => Response = zipAnswer) =>
      server.use(
        http.post(api('/downloads'), async ({ request }) => {
          asked.push(await request.json());
          return answer();
        }),
      );
    const files = [
      file(1, true, 'Predavanja'),
      file(2, true, 'Predavanja'),
      file(3, true, ''),
      file(4, false, ''),
    ];

    it('downloads a folder and a file as one zip', async () => {
      setup(posts, files);
      asked.length = 0;
      answerWith();
      renderApp('/courses/os');

      const box = async (name: string) =>
        screen.findByRole('checkbox', { name });
      const folder = await box('Select everything in Predavanja');
      // a file without content has no box, and no bar before a tick
      expect(
        screen.queryByRole('checkbox', { name: 'Select file-4.pdf' }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Download as ZIP' }),
      ).toBeNull();

      await userEvent.click(folder);
      expect(folder).toBeChecked();
      expect(await box('Select file-1.pdf')).toBeChecked();
      expect(await box('Select file-2.pdf')).toBeChecked();
      expect(screen.getByText('2 selected, 2.8 MB')).toBeVisible();

      // a folder's box follows its files
      await userEvent.click(await box('Select file-1.pdf'));
      expect(folder).toBePartiallyChecked();
      await userEvent.click(await box('Select file-1.pdf'));
      expect(folder).toBeChecked();

      await userEvent.click(await box('Select file-3.pdf'));
      expect(screen.getByText('3 selected, 4.2 MB')).toBeVisible();
      const all = screen.getByRole('checkbox', { name: 'Select all' });
      expect(all).toBeChecked();

      await userEvent.click(
        screen.getByRole('button', { name: 'Download as ZIP' }),
      );

      await waitFor(() =>
        expect(leaveTo).toHaveBeenCalledWith('/api/downloads/abc'),
      );
      expect(asked).toEqual([
        // in the order they were ticked: f1 again after f2
        { items: [{ file: 'f2' }, { file: 'f1' }, { file: 'f3' }] },
      ]);
      // the page stays, with what was ticked
      expect(folder).toBeChecked();
    });

    it('selects all and clears', async () => {
      setup(posts, files);
      renderApp('/courses/os');

      const all = await screen.findByRole('checkbox', { name: 'Select all' });
      await userEvent.click(all);
      expect(screen.getByText('3 selected, 4.2 MB')).toBeVisible();
      expect(
        screen.getByRole('checkbox', { name: 'Select file-3.pdf' }),
      ).toBeChecked();

      await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
      expect(all).not.toBeChecked();
      expect(screen.queryByText(/selected/)).toBeNull();
    });

    it('keeps what is ticked when the tab is changed and back', async () => {
      setup(posts, files);
      renderApp('/courses/os');

      await userEvent.click(
        await screen.findByRole('checkbox', { name: 'Select file-3.pdf' }),
      );
      await userEvent.click(screen.getByRole('tab', { name: 'Posts' }));
      expect(await screen.findByText('Post 1')).toBeVisible();
      expect(screen.queryByText(/selected/)).toBeNull();
      await userEvent.click(screen.getByRole('tab', { name: /^Files/ }));

      expect(await screen.findByText('1 selected, 1.4 MB')).toBeVisible();
    });

    it('says when it is over a gigabyte', async () => {
      setup(posts, files);
      answerWith(() =>
        HttpResponse.json(
          { statusCode: 422, code: 'DOWNLOAD_TOO_LARGE', message: 'big' },
          { status: 422 },
        ),
      );
      renderApp('/courses/os');

      await userEvent.click(
        await screen.findByRole('checkbox', { name: 'Select file-3.pdf' }),
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Download as ZIP' }),
      );

      expect(
        await screen.findByText("That's over 1 GB. Pick fewer files."),
      ).toBeVisible();
      expect(leaveTo).not.toHaveBeenCalled();
    });

    it('asks the hub for no more than 500 files', async () => {
      setup(posts, manyFiles(600));
      asked.length = 0;
      answerWith();
      renderApp('/courses/os');

      await userEvent.click(
        await screen.findByRole('checkbox', { name: 'Select all' }),
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Download as ZIP' }),
      );

      expect(
        await screen.findByText("That's over 500 files. Pick fewer files."),
      ).toBeVisible();
      expect(asked).toEqual([]);
    });

    it('says when a file is no longer there', async () => {
      setup(posts, files);
      answerWith(() => HttpResponse.json({}, { status: 404 }));
      renderApp('/courses/os');

      await userEvent.click(
        await screen.findByRole('checkbox', { name: 'Select file-3.pdf' }),
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Download as ZIP' }),
      );

      expect(
        await screen.findByText(
          'Some of these files are no longer available. Reload the page.',
        ),
      ).toBeVisible();
    });

    it('says what went wrong with any other failure', async () => {
      setup(posts, files);
      answerWith(() => HttpResponse.json({}, { status: 429 }));
      renderApp('/courses/os');

      await userEvent.click(
        await screen.findByRole('checkbox', { name: 'Select file-3.pdf' }),
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Download as ZIP' }),
      );

      expect(await screen.findByText(/Too many requests/)).toBeVisible();
    });
  });

  it('shows where the course comes from: each source, how she reads it, and a link to it', async () => {
    setup();
    server.use(
      http.get(api('/courses'), () =>
        HttpResponse.json([
          {
            slug: 'os',
            name: 'Operating systems',
            sources: ['canvas', 'catalog'],
            portalCourses: [
              {
                portal: 'canvas',
                externalId: '297',
                name: 'OS',
                url: 'https://canvas.example.edu/courses/297',
                year: 2026,
                via: 'account',
              },
              {
                portal: 'catalog',
                externalId: 'os',
                name: 'Operativni sistemi',
                url: 'javascript:alert(1)',
                year: null,
                via: 'pick',
              },
            ],
          },
        ]),
      ),
      http.get(api('/me/portals'), () =>
        HttpResponse.json([
          {
            portal: 'canvas',
            label: 'Canvas',
            mode: 'token',
            linked: true,
            status: 'linked',
            expiresAt: null,
            picked: null,
          },
        ]),
      ),
    );
    renderApp('/courses/os');

    const strip = await screen.findByRole('list', { name: 'Sources' });
    const [canvas, picked] = within(strip).getAllByRole('listitem');
    expect(await within(canvas).findByText('Canvas')).toBeVisible();
    expect(
      within(canvas).getByRole('link', { name: 'OS (2026)' }),
    ).toHaveAttribute('href', 'https://canvas.example.edu/courses/297');
    expect(within(canvas).getByText(/through your account/)).toBeVisible();
    // a portal the hub doesn't list to her goes by its id, and an address
    // that isn't a web one is no link
    expect(within(picked).getByText('catalog')).toBeVisible();
    expect(within(picked).queryByRole('link')).toBeNull();
    expect(within(picked).getByText(/picked by you/)).toBeVisible();
  });

  it('searches the course from its page', async () => {
    setup();
    server.use(
      http.get(api('/search'), () => HttpResponse.json({ results: [] })),
    );
    const { router } = renderApp('/courses/os');

    const field = await screen.findByRole('searchbox', {
      name: 'Search in this course',
    });
    expect(field).toHaveAttribute('placeholder', 'Search its files and posts');
    // nothing, or one character, to search for
    await userEvent.type(field, '   {Enter}');
    expect(router.state.location.pathname).toBe('/courses/os');
    await userEvent.clear(field);
    await userEvent.type(field, 'a{Enter}');
    expect(
      await screen.findByText('Type at least 2 characters to search'),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/courses/os');

    await userEvent.clear(field);
    await userEvent.type(field, ' stack {Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/search'));
    expect(router.state.location.search).toEqual({ q: 'stack', course: 'os' });
  });

  it('says the course is not found when it is not in the list', async () => {
    setup();
    renderApp('/courses/other');

    expect(
      await screen.findByRole('heading', { name: 'Course not found' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Back to My courses' }),
    ).toHaveAttribute('href', '/');
  });
});

describe('the count of files in Serbian', () => {
  it('has the form each number takes', async () => {
    const count = (n: number) =>
      i18n.t('courses:files.count', { count: n, lng: 'sr-Latn' });
    expect([1, 2, 5, 21].map(count)).toEqual([
      '1 fajl',
      '2 fajla',
      '5 fajlova',
      '21 fajl',
    ]);
  });
});

describe("what's new in a course", () => {
  const NOW = new Date('2026-11-07T12:00:00Z');
  const daysAgo = (n: number) =>
    new Date(NOW.getTime() - n * 86_400_000).toISOString();
  const dated = (n: number, changedAt: string | null, path = 'lectures') => ({
    ...file(n, true, path),
    changedAt,
  });

  // Date alone, so MSW, userEvent and Mantine keep real timers
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: NOW }));
  afterEach(() => vi.useRealTimers());

  it('shows what its portal changed in the last 14 days above the folders, each with its folder and date', async () => {
    setup(posts, [
      dated(1, daysAgo(2), 'Predavanja/2026'),
      dated(2, daysAgo(60), 'Vežbe'),
      dated(3, null, ''),
    ]);
    renderApp('/courses/os');

    const fresh = await screen.findByRole('region', { name: 'New' });
    const links = within(fresh).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/courses/os/files/f1');
    expect(links[0]).toHaveTextContent('Predavanja/2026');
    expect(links[0]).toHaveTextContent('1.4 MB · Nov 5');
    expect(
      screen.getByRole('navigation', { name: 'Files by folder' }),
    ).toBeVisible();
  });

  it('shows no New block when nothing changed in the last 14 days', async () => {
    setup(posts, [dated(1, daysAgo(15)), dated(2, null)]);
    renderApp('/courses/os');

    await screen.findByRole('navigation', { name: 'Files by folder' });
    expect(screen.queryByRole('region', { name: 'New' })).toBeNull();
  });

  it('shows ten new files, and all of them newest first on request', async () => {
    setup(
      posts,
      Array.from({ length: 12 }, (_, i) => dated(i + 1, daysAgo(i + 1))),
    );
    const { router } = renderApp('/courses/os');

    const fresh = await screen.findByRole('region', { name: 'New' });
    const links = within(fresh).getAllByRole('link');
    expect(links).toHaveLength(10);
    expect(links[0]).toHaveTextContent('file-1.pdf');

    await userEvent.click(
      within(fresh).getByRole('button', { name: 'Show all new (12)' }),
    );
    const list = await screen.findByRole('navigation', {
      name: 'Files, newest first',
    });
    expect(within(list).getAllByRole('link')).toHaveLength(12);
    expect(router.state.location.search).toEqual({ view: 'newest' });
    expect(screen.getByRole('radio', { name: 'Newest first' })).toBeChecked();
    expect(screen.queryByRole('region', { name: 'New' })).toBeNull();
  });

  it('lists every file newest first, the undated last, kept in the address', async () => {
    setup(posts, [
      dated(1, daysAgo(40), 'Vežbe'),
      dated(2, null, 'Predavanja'),
      dated(3, daysAgo(3), 'Predavanja'),
      dated(4, null, ''),
    ]);
    const { router } = renderApp('/courses/os?view=newest');

    const list = await screen.findByRole('navigation', {
      name: 'Files, newest first',
    });
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/courses/os/files/f3',
      '/courses/os/files/f1',
      '/courses/os/files/f4',
      '/courses/os/files/f2',
    ]);

    await userEvent.click(screen.getByRole('radio', { name: 'By folder' }));
    expect(
      await screen.findByRole('navigation', { name: 'Files by folder' }),
    ).toBeVisible();
    expect(router.state.location.search).toEqual({});

    await userEvent.click(screen.getByRole('radio', { name: 'Newest first' }));
    expect(router.state.location.search).toEqual({ view: 'newest' });

    await userEvent.click(screen.getByRole('tab', { name: 'Posts' }));
    expect(router.state.location.search).toEqual({
      view: 'newest',
      tab: 'posts',
    });
  });

  it('offers no newest-first list for a course whose files have no dates', async () => {
    setup(posts, [file(1), file(2)]);
    renderApp('/courses/os?view=newest');

    expect(
      await screen.findByRole('navigation', { name: 'Files by folder' }),
    ).toBeVisible();
    expect(screen.queryByRole('radiogroup', { name: 'Show files' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'New' })).toBeNull();
  });

  it("shows a file's size and date on one line", async () => {
    setup(posts, [dated(1, daysAgo(2)), dated(2, '2025-11-05T12:00:00.000Z')]);
    renderApp('/courses/os?tab=files&view=newest');
    await userEvent.click(
      await screen.findByRole('radio', { name: 'By folder' }),
    );

    const tree = await screen.findByRole('navigation', {
      name: 'Files by folder',
    });
    expect(
      within(tree).getByRole('link', { name: /file-1\.pdf/ }),
    ).toHaveTextContent('1.4 MB · Nov 5');
    expect(
      within(tree).getByRole('link', { name: /file-2\.pdf/ }),
    ).toHaveTextContent('1.4 MB · Nov 5, 2025');
  });
});
