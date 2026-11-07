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
    part('catalog', null, 'pick'),
  ],
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
