import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { renderApp } from './render';
import { server, signedIn } from './server';

const api = (path: string) => `http://localhost:3000/api${path}`;

describe('languages', () => {
  it('switches to Serbian from the user menu, everywhere at once', async () => {
    signedIn();
    server.use(
      http.get(api('/courses'), () => HttpResponse.json([])),
      http.get(api('/me/portals'), () => HttpResponse.json([])),
    );
    renderApp('/');

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Account menu for Ana Student',
      }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Srpski (latinica)' }),
    );

    const nav = await screen.findByRole('navigation', {
      name: 'Glavna navigacija',
    });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Moji predmeti', 'Pretraga', 'Izvori', 'Poveži AI']);
    expect(
      await screen.findByRole('heading', { name: 'Moji predmeti', level: 1 }),
    ).toBeVisible();
    expect(document.documentElement).toHaveAttribute('lang', 'sr-Latn');
    expect(localStorage.getItem('unihub.language')).toBe('sr-Latn');
  });

  it('switches on the sign-in page too', async () => {
    renderApp('/sign-in');

    await userEvent.click(
      await screen.findByRole('radio', { name: 'SR' }, { timeout: 3000 }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Prijavi se na UniHub' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Lozinka')).toBeVisible();
    expect(localStorage.getItem('unihub.language')).toBe('sr-Latn');
  });

  it('titles the tab in the chosen language', async () => {
    signedIn();
    server.use(
      http.get(api('/courses'), () => HttpResponse.json([])),
      http.get(api('/me/portals'), () => HttpResponse.json([])),
    );
    renderApp('/search');

    await screen.findByRole('heading', { name: 'Search', level: 1 });
    expect(document.title).toBe('Search · UniHub');
    await i18n.changeLanguage('sr-Latn');
    await screen.findByRole('heading', { name: 'Pretraga', level: 1 });
    await waitFor(() => expect(document.title).toBe('Pretraga · UniHub'));
  });

  it("says a course's date in the chosen language", async () => {
    signedIn();
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
      http.get(api('/me/portals'), () => HttpResponse.json([])),
      http.get(api('/courses/os/files'), () => HttpResponse.json([])),
      http.get(api('/courses/os/items'), () =>
        HttpResponse.json([
          {
            id: 'i1',
            portal: 'canvas',
            kind: 'announcement',
            title: 'Exam',
            url: null,
            publishedAt: '2026-11-07T12:00:00.000Z',
            raw: {},
          },
        ]),
      ),
    );
    renderApp('/courses/os');

    expect(await screen.findByText(/Nov 7, 2026/)).toBeVisible();
    await i18n.changeLanguage('sr-Latn');
    expect(
      await screen.findByText(/Obaveštenje · 7\. nov 2026\./),
    ).toBeVisible();
  });

  it('puts the Sources page into Serbian, the hub’s portal names kept', async () => {
    signedIn();
    await i18n.changeLanguage('sr-Latn');
    server.use(
      http.get(api('/me/portals'), () =>
        HttpResponse.json([
          {
            portal: 'canvas',
            label: 'Canvas',
            mode: 'token',
            linked: false,
            instance: null,
            status: null,
            expiresAt: null,
            picked: null,
          },
        ]),
      ),
    );
    renderApp('/sources');

    expect(
      await screen.findByRole('heading', { name: 'Izvori', level: 1 }),
    ).toBeVisible();
    expect(
      await screen.findByRole('button', { name: 'Poveži Canvas' }),
    ).toBeVisible();
    expect(screen.getByText('Nije povezano.')).toBeVisible();
  });
});
