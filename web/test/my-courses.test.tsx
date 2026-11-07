import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
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
