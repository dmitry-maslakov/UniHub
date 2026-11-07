import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from './render';
import { auth, refused, server, signedIn } from './server';

const key = {
  id: 'k1',
  name: 'Claude on my laptop',
  start: 'uh_4fQ',
  createdAt: '2026-11-02T09:00:00.000Z',
  expiresAt: '2027-01-31T09:00:00.000Z',
  lastRequest: null,
};

describe('Connect AI', () => {
  it('lists them, and shows a new one once', async () => {
    signedIn();
    let keys = [key];
    server.use(
      http.get(auth('/api-key/list'), () =>
        HttpResponse.json({ apiKeys: keys, total: keys.length }),
      ),
      http.post(auth('/api-key/create'), async ({ request }) => {
        const { name } = (await request.json()) as { name: string };
        keys = [
          ...keys,
          { ...key, id: 'k2', name, createdAt: '2026-11-06T09:00:00.000Z' },
        ];
        return HttpResponse.json({ ...keys[1], key: 'uh_secret_value' });
      }),
    );
    renderApp('/connect');

    const list = await screen.findByRole('list', { name: 'Your API keys' });
    expect(within(list).getByText('Claude on my laptop')).toBeVisible();
    expect(within(list).getByText(/Never used/)).toBeVisible();

    await userEvent.type(screen.getByLabelText('New key'), 'Cursor');
    await userEvent.click(screen.getByRole('button', { name: 'Create key' }));

    expect(await screen.findByText('uh_secret_value')).toBeVisible();
    expect(await within(list).findByText('Cursor')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('uh_secret_value')).toBeNull();
  });

  it('sends to sign in, and back, a session that ended meanwhile', async () => {
    signedIn();
    server.use(
      http.get(auth('/api-key/list'), () =>
        HttpResponse.json({ apiKeys: [], total: 0 }),
      ),
    );
    const { router, queryClient } = renderApp('/connect');
    await screen.findByLabelText('New key');

    server.use(http.get(auth('/get-session'), () => HttpResponse.json(null)));
    await queryClient.invalidateQueries({ queryKey: ['session'] });

    expect(
      await screen.findByRole('heading', { name: 'Sign in to UniHub' }),
    ).toBeVisible();
    expect(router.state.location.search).toEqual({
      next: '/connect',
    });
  });

  it('asks to sign in again when the session is too old to make one', async () => {
    signedIn();
    server.use(
      http.get(auth('/api-key/list'), () =>
        HttpResponse.json({ apiKeys: [], total: 0 }),
      ),
      http.post(auth('/api-key/create'), () =>
        refused(403, 'SESSION_NOT_FRESH'),
      ),
    );
    renderApp('/connect');

    await userEvent.type(await screen.findByLabelText('New key'), 'Cursor');
    await userEvent.click(screen.getByRole('button', { name: 'Create key' }));

    expect(
      await screen.findByRole('button', { name: 'Sign in again' }),
    ).toBeVisible();
    expect(screen.queryByText('SESSION_NOT_FRESH')).toBeNull();
  });
});
