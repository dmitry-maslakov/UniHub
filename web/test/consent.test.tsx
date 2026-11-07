import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leaveTo } from '@/shared/lib';
import { renderApp } from './render';
import { auth, refused, server, signedIn } from './server';

vi.mock('@/shared/lib/leave', () => ({ leaveTo: vi.fn() }));

const query = (
  redirect = 'https://claude.example/api/callback',
  scope = 'courses:read',
) =>
  `client_id=${encodeURIComponent('https://claude.example/oauth/client.json')}` +
  `&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(scope)}` +
  '&sig=abc&exp=1&ba_param=client_id&ba_param=redirect_uri&ba_param=scope';

let body: unknown;
beforeEach(() => {
  signedIn();
  body = undefined;
  server.use(
    http.get(auth('/oauth2/public-client'), () =>
      HttpResponse.json({
        client_id: 'https://claude.example/oauth/client.json',
        client_name: 'Claude',
        logo_uri: 'https://claude.example/logo.png',
      }),
    ),
    http.post(auth('/oauth2/consent'), async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({
        redirect: true,
        url: 'https://claude.example/api/callback?code=c1',
      });
    }),
  );
});

describe('consent', () => {
  it('names the requester by the host of its client_id, and loads no logo', async () => {
    renderApp(`/consent?${query()}`);

    expect(
      await screen.findByRole('heading', {
        name: 'claude.example wants to read your courses',
      }),
    ).toBeVisible();
    expect(await screen.findByText(/It calls itself “Claude”/)).toBeVisible();
    expect(
      screen.getByText('claude.example', { selector: 'strong' }),
    ).toBeVisible();
    expect(screen.getByText(/Signed in as ana@uni.test/)).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
    expect(document.querySelector('img, [src*="logo"]')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('promises an app that asked for no refresh token an hour, not 30 days', async () => {
    renderApp(`/consent?${query()}`);

    expect(
      await screen.findByText(
        'Connected for an hour; then the app asks you again.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Stay connected/)).toBeNull();
  });

  it('says an app that asked for offline_access stays connected', async () => {
    renderApp(`/consent?${query(undefined, 'courses:read offline_access')}`);

    expect(
      await screen.findByText(
        'Stay connected until you change your password, or for 30 days after you last use it',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Connected for an hour/)).toBeNull();
  });

  it('sends the signed query back with the answer, then goes on to the url', async () => {
    renderApp(`/consent?${query()}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Allow' }));

    await vi.waitFor(() =>
      expect(leaveTo).toHaveBeenCalledWith(
        'https://claude.example/api/callback?code=c1',
      ),
    );
    expect(body).toEqual({ accept: true, oauth_query: query() });
  });

  it('denies the same way', async () => {
    renderApp(`/consent?${query()}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Deny' }));

    await vi.waitFor(() => expect(body).toMatchObject({ accept: false }));
  });

  it('warns in red when the way back is this computer', async () => {
    renderApp(`/consent?${query('http://127.0.0.1:53682/callback')}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Only a program running on this computer/,
    );
    expect(screen.getByText('127.0.0.1:53682')).toBeVisible();
  });

  it('goes to sign in again, with the same signed query, when the session is too old', async () => {
    server.use(
      http.post(auth('/oauth2/consent'), () =>
        refused(403, 'SESSION_NOT_FRESH'),
      ),
    );
    const { router } = renderApp(`/consent?${query()}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Allow' }));

    expect(
      await screen.findByRole('heading', { name: 'Sign in to UniHub' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(router.state.location.searchStr.slice(1)).toBe(
      new URLSearchParams(query()).toString(),
    );
  });

  it('says plainly when there is no signed query to answer', async () => {
    renderApp('/consent');

    expect(
      await screen.findByRole('heading', { name: 'Nothing to approve' }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
  });

  it('says the same of a client_id that is not an address', async () => {
    renderApp(
      '/consent?client_id=nope&redirect_uri=https%3A%2F%2Fa.example&sig=x',
    );

    expect(
      await screen.findByRole('heading', { name: 'Nothing to approve' }),
    ).toBeVisible();
  });
});
