import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from './render';
import { server, signedIn } from './server';

const api = (path: string) => `http://localhost:3000/api${path}`;
const TOKEN = 'canvas-secret-token-4711';

const portals = [
  {
    portal: 'campus',
    label: 'Campus site',
    mode: 'shared',
    linked: false,
    status: null,
    expiresAt: null,
    picked: null,
  },
  {
    portal: 'canvas',
    label: 'Canvas',
    mode: 'token',
    linked: false,
    status: null,
    expiresAt: null,
    picked: null,
  },
];

const listPortals = () =>
  server.use(http.get(api('/me/portals'), () => HttpResponse.json(portals)));

const linkWith = async (token = TOKEN) => {
  await userEvent.type(await screen.findByLabelText('Token'), token);
  await userEvent.click(screen.getByRole('button', { name: 'Link account' }));
};

describe('portal accounts', () => {
  it('lists each portal with where its account stands', async () => {
    signedIn();
    server.use(
      http.get(api('/me/portals'), () =>
        HttpResponse.json([
          portals[0],
          { ...portals[1], linked: true, status: 'expired' },
        ]),
      ),
    );
    renderApp('/settings/portals');

    const list = await screen.findByRole('list', { name: 'Portals' });
    // each by the name it's shown by, not its id
    expect(
      within(list).getByRole('heading', { name: 'Campus site' }),
    ).toBeVisible();
    expect(within(list).getByRole('heading', { name: 'Canvas' })).toBeVisible();
    expect(within(list).queryByText('canvas')).toBeNull();
    expect(within(list).getByText(/Nothing to link/)).toBeVisible();
    expect(within(list).getByText(/token expired/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Replace token' })).toBeVisible();
  });

  it('sends the token once, and keeps and shows it nowhere', async () => {
    signedIn();
    listPortals();
    let sent: unknown;
    server.use(
      http.put(api('/me/portals/canvas/token'), async ({ request }) => {
        sent = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const log = vi.spyOn(console, 'log');
    const { queryClient } = renderApp('/settings/portals');

    await linkWith();

    expect(await screen.findByText(/Canvas is linked/)).toBeVisible();
    expect(sent).toEqual({ token: TOKEN });
    expect(screen.getByLabelText('Token')).toHaveValue('');
    expect(document.body).not.toHaveTextContent(TOKEN);
    expect(document.body.innerHTML).not.toContain(TOKEN);
    expect(
      JSON.stringify(
        queryClient
          .getMutationCache()
          .getAll()
          .map((m) => [m.state.variables, m.state.context, m.state.data]),
      ),
    ).not.toContain(TOKEN);
    expect(
      log.mock.calls.flat().join(' ') + document.body.innerHTML,
    ).not.toContain(TOKEN);
  });

  it('empties the field even when the portal refuses the token', async () => {
    signedIn();
    listPortals();
    server.use(
      http.put(api('/me/portals/canvas/token'), () =>
        HttpResponse.json({ statusCode: 422 }, { status: 422 }),
      ),
    );
    renderApp('/settings/portals');

    await linkWith();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "didn't accept that token",
    );
    expect(screen.getByLabelText('Token')).toHaveValue('');
    expect(document.body.innerHTML).not.toContain(TOKEN);
  });

  it('says calmly when linking is not open to the user', async () => {
    signedIn();
    listPortals();
    server.use(
      http.put(api('/me/portals/canvas/token'), () =>
        HttpResponse.json({ statusCode: 404 }, { status: 404 }),
      ),
    );
    renderApp('/settings/portals');

    await linkWith();

    expect(await screen.findByText(/isn't open to you/)).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByLabelText('Token')).toBeNull();
  });

  it('asks to sign in again when the session is too old to link', async () => {
    signedIn();
    listPortals();
    server.use(
      http.put(api('/me/portals/canvas/token'), () =>
        HttpResponse.json(
          { statusCode: 403, code: 'SESSION_NOT_FRESH' },
          { status: 403 },
        ),
      ),
    );
    renderApp('/settings/portals');

    await linkWith();

    expect(
      await screen.findByRole('button', { name: 'Sign in again' }),
    ).toBeVisible();
  });

  it('unlinks after a confirm', async () => {
    signedIn();
    let unlinked = false;
    server.use(
      http.get(api('/me/portals'), () =>
        HttpResponse.json([
          portals[0],
          {
            ...portals[1],
            linked: !unlinked,
            status: unlinked ? null : 'linked',
          },
        ]),
      ),
      http.delete(api('/me/portals/canvas/token'), () => {
        unlinked = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/settings/portals');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Unlink Canvas' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Unlink Canvas?' }),
    ).toHaveTextContent('stops reading Canvas as you');
    expect(unlinked).toBe(false);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Unlink' }),
    );

    expect(await screen.findByText('Not linked.')).toBeVisible();
    expect(await screen.findByText('Canvas is unlinked.')).toBeVisible();
  });
});
