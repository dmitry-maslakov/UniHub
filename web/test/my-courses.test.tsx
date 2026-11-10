import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from './render';
import { server, signedIn } from './server';

const api = (path: string) => `http://localhost:3000/api${path}`;

const portals = [
  {
    portal: 'canvas',
    label: 'Canvas',
    mode: 'token',
    linked: true,
    instance: 'https://canvas.example.edu',
    status: 'linked',
    expiresAt: null,
    picked: null,
    firstSync: false,
  },
  {
    portal: 'catalog',
    label: 'Course catalog',
    mode: 'public',
    linked: false,
    instance: null,
    status: null,
    expiresAt: null,
    picked: 0,
    firstSync: false,
  },
];
const part = (portal: string, year: number | null, via: string) => ({
  portal,
  externalId: `${portal}-os`,
  name: 'Operativni sistemi',
  url: null,
  year,
  via,
});
const os = {
  slug: 'canvas~297',
  name: 'Operativni sistemi',
  sources: ['canvas', 'catalog'],
  portalCourses: [
    part('canvas', 2026, 'account'),
    part('catalog', null, 'public'),
  ],
  hidden: false,
};

describe('My courses', () => {
  it('is the home page: one list, each course with its sources by name', async () => {
    signedIn();
    server.use(
      http.get(api('/courses'), () => HttpResponse.json([os])),
      http.get(api('/me/portals'), () => HttpResponse.json(portals)),
    );
    renderApp('/');

    expect(
      await screen.findByRole('heading', { name: 'My courses', level: 1 }),
    ).toBeVisible();
    const list = await screen.findByRole('list', { name: 'Your courses' });
    const row = within(list).getByRole('link', { name: /Operativni sistemi/ });
    expect(row).toHaveAttribute('href', '/courses/canvas~297');
    expect(await within(row).findByText('Canvas')).toBeVisible();
    expect(within(row).getByText('Course catalog')).toBeVisible();
    expect(within(row).getByText('2026')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Add a source' })).toBeNull();
  });

  it('hides a course into a list of its own, and shows it again from there', async () => {
    signedIn();
    const hidden = new Set<string>();
    const net = { ...os, slug: 'canvas~15', name: 'Internet mreže' };
    const changed: string[] = [];
    server.use(
      http.get(api('/courses'), () =>
        HttpResponse.json(
          [os, net].map((c) => ({ ...c, hidden: hidden.has(c.slug) })),
        ),
      ),
      http.get(api('/me/portals'), () => HttpResponse.json(portals)),
      http.put(api('/courses/:slug/hidden'), ({ params }) => {
        hidden.add(String(params.slug));
        changed.push(`hide ${String(params.slug)}`);
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(api('/courses/:slug/hidden'), ({ params }) => {
        hidden.delete(String(params.slug));
        changed.push(`show ${String(params.slug)}`);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/');

    const list = await screen.findByRole('list', { name: 'Your courses' });
    expect(screen.queryByRole('heading', { name: 'Hidden' })).toBeNull();
    await userEvent.click(
      within(list).getByRole('button', {
        name: 'Hide Internet mreže from My courses',
      }),
    );

    const hiddenList = await screen.findByRole('list', {
      name: 'Hidden courses',
    });
    expect(
      within(hiddenList).getByRole('link', { name: /Internet mreže/ }),
    ).toHaveAttribute('href', '/courses/canvas~15');
    expect(
      within(list).queryByRole('link', { name: /Internet mreže/ }),
    ).toBeNull();
    expect(
      within(list).getByRole('link', { name: /Operativni/ }),
    ).toBeVisible();
    expect(screen.getByText(/your AI apps read them as before/)).toBeVisible();

    await userEvent.click(
      within(hiddenList).getByRole('button', {
        name: 'Show Internet mreže in My courses',
      }),
    );
    expect(
      await within(list).findByRole('link', { name: /Internet mreže/ }),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Hidden' })).toBeNull();
    expect(changed).toEqual(['hide canvas~15', 'show canvas~15']);
  });

  it('says so when every course is hidden, and when hiding one fails', async () => {
    signedIn();
    server.use(
      http.get(api('/courses'), () =>
        HttpResponse.json([{ ...os, hidden: true }]),
      ),
      http.get(api('/me/portals'), () => HttpResponse.json(portals)),
      http.delete(api('/courses/:slug/hidden'), () =>
        HttpResponse.json({ statusCode: 500 }, { status: 500 }),
      ),
    );
    renderApp('/');

    expect(
      await screen.findByText(/You hide all of your courses/),
    ).toBeVisible();
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Show Operativni sistemi in My courses',
      }),
    );
    expect(
      await screen.findByText("Couldn't show the course. Try again."),
    ).toBeVisible();
  });

  it('shows the sources inline on a first visit with no course, and keeps them as the first one comes', async () => {
    signedIn();
    const picked = new Set<string>();
    server.use(
      http.get(api('/courses'), () =>
        HttpResponse.json(
          picked.size
            ? [{ ...os, slug: 'catalog~os', sources: ['catalog'] }]
            : [],
        ),
      ),
      http.get(api('/me/portals'), () =>
        HttpResponse.json([{ ...portals[1], picked: picked.size }]),
      ),
      http.get(api('/portals/catalog/catalog'), () =>
        HttpResponse.json({
          total: 1,
          courses: [
            {
              externalId: 'os',
              name: 'Operativni sistemi',
              url: null,
              picked: picked.has('os'),
              isNew: false,
              into: null,
              suggestedInto: null,
            },
          ],
        }),
      ),
      http.put(api('/me/picks/catalog/os'), () => {
        picked.add('os');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/');

    expect(
      await screen.findByRole('heading', { name: 'Add a source' }),
    ).toBeVisible();
    expect(screen.getByText(/Nothing to read yet/)).toBeVisible();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Operativni sistemi' }),
    );

    const list = await screen.findByRole('list', { name: 'Your courses' });
    expect(
      within(list).getByRole('link', { name: /Operativni sistemi/ }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Add a source' })).toBeVisible();
    expect(screen.getByRole('list', { name: 'Sources' })).toBeVisible();
    // a level under Add a source
    expect(
      screen.getByRole('heading', { name: 'Course catalog', level: 3 }),
    ).toBeVisible();
    expect(screen.queryByText(/Nothing to read yet/)).toBeNull();
  });

  it('says an account just linked is read for the first time, in place of the sources, and asks again every 30 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      signedIn();
      let read = false;
      server.use(
        http.get(api('/courses'), () => HttpResponse.json(read ? [os] : [])),
        http.get(api('/me/portals'), () =>
          HttpResponse.json([{ ...portals[0], firstSync: !read }, portals[1]]),
        ),
      );
      renderApp('/');

      const status = (
        await screen.findByText('Reading your Canvas for the first time')
      ).closest('output')!;
      expect(status).toHaveTextContent(
        'Your courses show up here in a few minutes. You can leave this page open.',
      );
      // the sources stay, so the focus of a form that linked one stays
      expect(
        screen.getByRole('heading', { name: 'Add a source' }),
      ).toBeVisible();
      expect(screen.queryByText(/Nothing to read yet/)).toBeNull();

      read = true;
      await vi.advanceTimersByTimeAsync(30_000);
      const list = await screen.findByRole('list', { name: 'Your courses' });
      expect(
        within(list).getByRole('link', { name: /Operativni sistemi/ }),
      ).toBeVisible();
      expect(
        screen.queryByText('Reading your Canvas for the first time'),
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks for the courses once more as the first read ends, whichever answer comes first', async () => {
    signedIn();
    let read = false;
    server.use(
      http.get(api('/courses'), () => HttpResponse.json(read ? [os] : [])),
      http.get(api('/me/portals'), () =>
        HttpResponse.json([{ ...portals[0], firstSync: !read }, portals[1]]),
      ),
    );
    const { queryClient } = renderApp('/');
    expect(
      await screen.findByText('Reading your Canvas for the first time'),
    ).toBeVisible();

    // the sources say it ended before the courses were asked again
    read = true;
    await queryClient.refetchQueries({ queryKey: ['get', '/api/me/portals'] });

    const list = await screen.findByRole('list', { name: 'Your courses' });
    expect(
      within(list).getByRole('link', { name: /Operativni sistemi/ }),
    ).toBeVisible();
  });

  it('notes a first read above the courses already there', async () => {
    signedIn();
    server.use(
      http.get(api('/courses'), () => HttpResponse.json([os])),
      http.get(api('/me/portals'), () =>
        HttpResponse.json([{ ...portals[0], firstSync: true }, portals[1]]),
      ),
    );
    renderApp('/');

    const note = await screen.findByText(
      'Reading your Canvas for the first time',
    );
    expect(note.closest('output')).not.toBeNull();
    expect(screen.getByRole('list', { name: 'Your courses' })).toBeVisible();
  });

  it('shows no empty state before the sources have answered', async () => {
    signedIn();
    server.use(
      http.get(api('/courses'), () => HttpResponse.json([])),
      http.get(api('/me/portals'), async () => {
        await delay(100);
        return HttpResponse.json([
          { ...portals[0], firstSync: true },
          portals[1],
        ]);
      }),
    );
    renderApp('/');

    expect(await screen.findByText('Loading your courses')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Add a source' })).toBeNull();
    expect(
      await screen.findByText('Reading your Canvas for the first time'),
    ).toBeVisible();
  });

  it('keeps the sources for a user with nothing linked or picked', async () => {
    signedIn();
    server.use(
      http.get(api('/courses'), () => HttpResponse.json([])),
      http.get(api('/me/portals'), () =>
        HttpResponse.json([
          { ...portals[0], linked: false, status: null, instance: null },
          portals[1],
        ]),
      ),
      http.get(api('/portals/catalog/catalog'), () =>
        HttpResponse.json({ total: 0, courses: [] }),
      ),
    );
    renderApp('/');

    expect(
      await screen.findByRole('heading', { name: 'Add a source' }),
    ).toBeVisible();
    expect(screen.queryByText(/for the first time/)).toBeNull();
  });

  it('takes the old courses address home, and keeps the account at its own', async () => {
    signedIn();
    server.use(http.get(api('/courses'), () => HttpResponse.json([])));
    const { router } = renderApp('/courses');

    expect(
      await screen.findByRole('heading', { name: 'My courses', level: 1 }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/');
    await router.navigate({ to: '/account' });
    expect(
      await screen.findByRole('heading', { name: 'Ana Student', level: 1 }),
    ).toBeVisible();
  });
});
