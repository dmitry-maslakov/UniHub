import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

// the apps let in: none, unless a test says so
const noApps = () =>
  server.use(
    http.get(auth('/oauth2/get-consents'), () => HttpResponse.json([])),
  );

describe('Connect AI', () => {
  beforeEach(noApps);

  it('shows the MCP address of this hub, ready to copy', async () => {
    signedIn();
    server.use(
      http.get(auth('/api-key/list'), () =>
        HttpResponse.json({ apiKeys: [], total: 0 }),
      ),
    );
    renderApp('/connect');

    expect(
      await screen.findByRole('heading', {
        name: 'Your UniHub address for AI apps',
      }),
    ).toBeVisible();
    expect(screen.getByText('http://localhost:3000/api/mcp')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copy MCP address' })).toBeVisible();
  });

  it('shows the Claude Code command for this hub', async () => {
    signedIn();
    server.use(
      http.get(auth('/api-key/list'), () =>
        HttpResponse.json({ apiKeys: [], total: 0 }),
      ),
    );
    renderApp('/connect');

    // Claude's steps first, and the others a tab away
    expect(
      await screen.findByText(/choose “Use Claude's published identity”/),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('tab', { name: 'Claude Code' }));
    expect(
      await screen.findByText(
        'claude mcp add --transport http unihub http://localhost:3000/api/mcp',
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('tab', { name: 'ChatGPT' }));
    expect(await screen.findByText(/turn on developer mode/)).toBeVisible();
  });

  it('lists connected apps by name and host, and revokes one after a confirm', async () => {
    signedIn();
    let consents = [
      {
        id: 'c1',
        clientId: 'https://agent.example/oauth/client.json',
        createdAt: '2026-11-05T09:00:00.000Z',
      },
      {
        id: 'c2',
        clientId: 'https://other.example/client.json',
        createdAt: '2026-11-06T09:00:00.000Z',
      },
    ];
    const revoked: unknown[] = [];
    server.use(
      http.get(auth('/api-key/list'), () =>
        HttpResponse.json({ apiKeys: [], total: 0 }),
      ),
      http.get(auth('/oauth2/get-consents'), () => HttpResponse.json(consents)),
      http.get(auth('/oauth2/public-client'), ({ request }) => {
        const id = new URL(request.url).searchParams.get('client_id');
        return id?.includes('agent')
          ? HttpResponse.json({ client_id: id, client_name: 'Agent' })
          : refused(404, 'NOT_FOUND');
      }),
      http.post(auth('/oauth2/delete-consent'), async ({ request }) => {
        const body = (await request.json()) as { id: string };
        revoked.push(body);
        consents = consents.filter((c) => c.id !== body.id);
        return HttpResponse.json({});
      }),
    );
    renderApp('/connect');

    const list = await screen.findByRole('list', { name: 'Connected apps' });
    const rows = within(list).getAllByRole('listitem');
    // newest first; one that gives no name is named by its host
    expect(rows[0]).toHaveTextContent('other.example');
    expect(rows[1]).toHaveTextContent('Agent');
    expect(rows[1]).toHaveTextContent('agent.example');
    expect(rows[1]).toHaveTextContent('Connected Nov 5, 2026');

    await userEvent.click(
      within(rows[1]!).getByRole('button', { name: 'Revoke Agent' }),
    );
    expect(await screen.findByText('Revoke Agent?')).toBeVisible();
    expect(revoked).toEqual([]);
    await userEvent.click(
      screen.getByRole('button', { name: 'Revoke access' }),
    );

    expect(await screen.findByText('Agent is disconnected.')).toBeVisible();
    expect(revoked).toEqual([{ id: 'c1' }]);
    await vi.waitFor(() =>
      expect(within(list).getAllByRole('listitem')).toHaveLength(1),
    );
  });

  it('names an app by its host when it gives no name', async () => {
    signedIn();
    server.use(
      http.get(auth('/api-key/list'), () =>
        HttpResponse.json({ apiKeys: [], total: 0 }),
      ),
      http.get(auth('/oauth2/get-consents'), () =>
        HttpResponse.json([
          {
            id: 'c1',
            clientId: 'https://nameless.example/client.json',
            createdAt: '2026-11-05T09:00:00.000Z',
          },
        ]),
      ),
      http.get(auth('/oauth2/public-client'), () =>
        HttpResponse.json({ client_id: 'x', client_name: '  ' }),
      ),
    );
    renderApp('/connect');

    const list = await screen.findByRole('list', { name: 'Connected apps' });
    const row = within(list).getByRole('listitem');
    expect(row).toHaveTextContent('nameless.example');
    expect(
      within(row).getByRole('button', { name: 'Revoke nameless.example' }),
    ).toBeVisible();
  });

  it('says when no app is connected', async () => {
    signedIn();
    server.use(
      http.get(auth('/api-key/list'), () =>
        HttpResponse.json({ apiKeys: [], total: 0 }),
      ),
    );
    renderApp('/connect');

    expect(await screen.findByText('No apps connected')).toBeVisible();
  });

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
