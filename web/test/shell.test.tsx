import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from './render';
import { server, signedIn } from './server';

const api = (path: string) => `http://localhost:3000/api${path}`;

const os = {
  slug: 'os',
  name: 'Operating systems',
  sources: [],
  portalCourses: [],
};

const hub = () => {
  signedIn();
  server.use(
    http.get(api('/courses'), () => HttpResponse.json([os])),
    http.get(api('/me/portals'), () => HttpResponse.json([])),
    http.get(api('/courses/os/items'), () => HttpResponse.json([])),
    http.get(api('/courses/os/files'), () => HttpResponse.json([])),
  );
};

const openMenu = async () => {
  await userEvent.click(
    await screen.findByRole('button', { name: 'Account menu for Ana Student' }),
  );
  // the menu fades in: it is there to use once its items are
  await screen.findByRole('menuitem', { name: 'Account' });
  return within(document.body);
};

describe('the shell', () => {
  it('lands on My courses', async () => {
    hub();
    const { router } = renderApp('/');

    expect(
      await screen.findByRole('heading', { name: 'My courses', level: 1 }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/');
  });

  it('takes the old API keys address to Connect AI', async () => {
    hub();
    server.use(
      http.get('http://localhost:3000/api/auth/api-key/list', () =>
        HttpResponse.json({ apiKeys: [], total: 0 }),
      ),
    );
    const { router } = renderApp('/settings/api-keys');

    expect(
      await screen.findByRole('heading', { name: 'Connect AI', level: 1 }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/connect');
  });

  it('has My courses, Search, Sources and Connect AI in the navigation, and nothing of the account', async () => {
    hub();
    renderApp('/');

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['My courses', 'Search', 'Sources', 'Connect AI']);
    expect(
      screen.queryByRole('button', { name: /Switch to (light|dark) mode/ }),
    ).toBeNull();
  });

  it("marks My courses current on a course's page", async () => {
    hub();
    renderApp('/courses/os');

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(
      within(nav).getByRole('link', { name: 'My courses' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(nav).getByRole('link', { name: 'Search' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('puts Account, the theme, the language, Privacy and Sign out in the user menu', async () => {
    hub();
    renderApp('/');

    const menu = await openMenu();
    expect(
      menu.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual([
      'Account',
      'Light',
      'Dark',
      'Match system',
      'Srpski (latinica)',
      'English',
      'Privacy',
      'Sign out',
    ]);
    // the current theme and language are marked
    expect(menu.getByRole('menuitem', { name: 'English' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(
      menu.getByRole('menuitem', { name: 'Match system' }),
    ).toHaveAttribute('aria-current', 'true');
    expect(menu.getByRole('menuitem', { name: 'Dark' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(menu.getByText('ana@uni.test')).toBeVisible();
    expect(menu.getByText(/^Version /)).toBeVisible();
  });

  it('switches to dark from the user menu and remembers it', async () => {
    hub();
    renderApp('/');

    const menu = await openMenu();
    await userEvent.click(menu.getByRole('menuitem', { name: 'Dark' }));

    expect(document.documentElement).toHaveAttribute(
      'data-mantine-color-scheme',
      'dark',
    );
    expect(localStorage.getItem('mantine-color-scheme-value')).toBe('dark');
  });
});
