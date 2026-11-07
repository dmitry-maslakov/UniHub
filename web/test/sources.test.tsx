import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { Schemas } from '@/shared/api';
import { renderApp } from './render';
import { server, signedIn } from './server';

const api = (path: string) => `http://localhost:3000/api${path}`;
const TOKEN = 'canvas-secret-token-4711';
const SCHOOL = 'https://canvas.example.edu';

const portals: Schemas['PortalResponse'][] = [
  {
    portal: 'campus',
    label: 'Campus',
    mode: 'shared',
    linked: true,
    instance: null,
    status: 'linked',
    expiresAt: null,
    picked: null,
  },
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
];

const listPortals = (list = portals) =>
  server.use(http.get(api('/me/portals'), () => HttpResponse.json(list)));

const linkWith = async ({
  address = 'canvas.example.edu/courses/1',
  token = TOKEN,
} = {}) => {
  if (address)
    await userEvent.type(
      await screen.findByLabelText("Your school's Canvas"),
      address,
    );
  await userEvent.type(await screen.findByLabelText('Token'), token);
  await userEvent.click(screen.getByRole('button', { name: 'Link Canvas' }));
};

describe('sources', () => {
  it('lists each source with where its account stands, the school and the expiry', async () => {
    signedIn();
    listPortals([
      portals[0],
      {
        ...portals[1],
        linked: true,
        status: 'linked',
        instance: SCHOOL,
        expiresAt: '2026-12-30T08:00:00.000Z',
      },
    ]);
    renderApp('/sources');

    const list = await screen.findByRole('list', { name: 'Sources' });
    expect(within(list).getByText(/reads Campus for everyone/)).toBeVisible();
    expect(
      within(list).getByText(
        'Linked to canvas.example.edu. The token works until Dec 30, 2026.',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("Your school's Canvas")).toHaveValue(SCHOOL);
    expect(screen.getByRole('button', { name: 'Replace token' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Unlink Campus' })).toBeVisible();
  });

  it('takes the old address to Sources', async () => {
    signedIn();
    listPortals();
    const { router } = renderApp('/settings/portals');

    expect(
      await screen.findByRole('heading', { name: 'Sources', level: 1 }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/sources');
  });

  it("links the token to the school's Canvas, and points at where tokens are made there", async () => {
    signedIn();
    listPortals();
    renderApp('/sources');

    await userEvent.type(
      await screen.findByLabelText("Your school's Canvas"),
      'canvas.example.edu',
    );
    expect(screen.getByRole('link', { name: /Get a token/ })).toHaveAttribute(
      'href',
      `${SCHOOL}/profile/settings`,
    );
  });

  it('sends the token once, with the address, and keeps and shows it nowhere', async () => {
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
    const { queryClient } = renderApp('/sources');

    await linkWith();

    expect(await screen.findByText(/Canvas is linked/)).toBeVisible();
    expect(sent).toEqual({ token: TOKEN, url: SCHOOL });
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

  it("asks for the school's address first, sending nothing and keeping the token", async () => {
    signedIn();
    listPortals();
    const put = vi.fn();
    server.use(http.put(api('/me/portals/canvas/token'), put));
    renderApp('/sources');

    await linkWith({ address: 'http://canvas.example.edu' });

    expect(
      await screen.findByText(/Enter the address you open Canvas at/),
    ).toBeVisible();
    expect(put).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Token')).toHaveValue(TOKEN);
  });

  it('empties the field even when Canvas refuses the token', async () => {
    signedIn();
    listPortals();
    server.use(
      http.put(api('/me/portals/canvas/token'), () =>
        HttpResponse.json(
          { statusCode: 422, code: 'TOKEN_REFUSED' },
          { status: 422 },
        ),
      ),
    );
    renderApp('/sources');

    await linkWith();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Canvas didn't accept that token",
    );
    expect(screen.getByLabelText('Token')).toHaveValue('');
    expect(document.body.innerHTML).not.toContain(TOKEN);
  });

  it('says why a Canvas Instructure hosts takes no token', async () => {
    signedIn();
    listPortals();
    server.use(
      http.put(api('/me/portals/canvas/token'), () =>
        HttpResponse.json(
          { statusCode: 422, code: 'TOKENS_NOT_ALLOWED' },
          { status: 422 },
        ),
      ),
    );
    renderApp('/sources');

    await linkWith();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Instructure hosts this Canvas.*only by OAuth/,
    );
  });

  it('says calmly when linking is not open to the user', async () => {
    signedIn();
    listPortals();
    server.use(
      http.put(api('/me/portals/canvas/token'), () =>
        HttpResponse.json({ statusCode: 404 }, { status: 404 }),
      ),
    );
    renderApp('/sources');

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
    renderApp('/sources');

    await linkWith();

    expect(
      await screen.findByRole('button', { name: 'Sign in again' }),
    ).toBeVisible();
  });

  it('links a source of one site by its token alone', async () => {
    signedIn();
    listPortals([
      {
        ...portals[1],
        portal: 'moodle',
        label: 'Moodle',
      },
    ]);
    let sent: unknown;
    server.use(
      http.put(api('/me/portals/moodle/token'), async ({ request }) => {
        sent = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/sources');

    await userEvent.type(await screen.findByLabelText('Token'), TOKEN);
    await userEvent.click(screen.getByRole('button', { name: 'Link Moodle' }));

    expect(await screen.findByText(/Moodle is linked/)).toBeVisible();
    expect(sent).toEqual({ token: TOKEN });
    expect(screen.queryByLabelText(/Your school's/)).toBeNull();
  });

  it('unlinks after a confirm', async () => {
    signedIn();
    let unlinked = false;
    server.use(
      http.get(api('/me/portals'), () =>
        HttpResponse.json([
          {
            ...portals[1],
            linked: !unlinked,
            status: unlinked ? null : 'linked',
            instance: unlinked ? null : SCHOOL,
          },
        ]),
      ),
      http.delete(api('/me/portals/canvas/token'), () => {
        unlinked = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/sources');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Unlink Canvas' }),
    );
    expect(unlinked).toBe(false);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Unlink' }),
    );

    expect(await screen.findByText('Not linked.')).toBeVisible();
  });
});
