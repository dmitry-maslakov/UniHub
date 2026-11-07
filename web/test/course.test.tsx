import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { renderApp } from './render';
import { server, signedIn } from './server';

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
          ? HttpResponse.json({ statusCode: 500 }, { status: 500 })
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
    // a small course starts open: the subfolder and its file are there
    expect(within(tree).getByText('2026')).toBeVisible();
    expect(
      within(tree).getByRole('link', { name: /file-1\.pdf/ }),
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

  it('starts the folders closed past fifty files', async () => {
    setup(posts, manyFiles(51));
    renderApp('/courses/os');

    const tree = await screen.findByRole('navigation', {
      name: 'Files by folder',
    });
    expect(within(tree).getByText('folder 0')).toBeVisible();
    expect(within(tree).getAllByText('17 files')).toHaveLength(3);
    expect(
      within(tree).queryByRole('link', { name: /file-1\.pdf/ }),
    ).toBeNull();
    await userEvent.click(within(tree).getByText('folder 1'));
    expect(
      await within(tree).findByRole('link', { name: /file-2\.pdf/ }),
    ).toBeVisible();
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
  });

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
    // nothing to search for
    await userEvent.type(field, '   {Enter}');
    expect(router.state.location.pathname).toBe('/courses/os');

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
