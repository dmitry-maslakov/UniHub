import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from './render';
import { auth, refused, server, session, signedIn, user } from './server';

const chrome =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const safari =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

const account = (providerId: string) => ({
  id: `a-${providerId}`,
  providerId,
  accountId: 'u1',
  userId: 'u1',
  scopes: [],
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
});

const row = (id: string, userAgent: string, updatedAt: string) => ({
  ...session.session,
  id,
  token: `token-${id}`,
  userAgent,
  ipAddress: '203.0.113.7',
  updatedAt,
});

// signed in, with a password and the one session unless a test says so
function setUp(
  options: { accounts?: string[]; sessions?: ReturnType<typeof row>[] } = {},
) {
  signedIn();
  let sessions = options.sessions ?? [
    row('s1', chrome, '2026-11-06T10:00:00.000Z'),
  ];
  server.use(
    http.get(auth('/list-accounts'), () =>
      HttpResponse.json((options.accounts ?? ['credential']).map(account)),
    ),
    http.get(auth('/list-sessions'), () => HttpResponse.json(sessions)),
  );
  return {
    drop: (keep: (s: (typeof sessions)[number]) => boolean) => {
      sessions = sessions.filter(keep);
    },
  };
}

describe('the account', () => {
  it('saves a new name', async () => {
    setUp();
    let name = user.name;
    server.use(
      http.get(auth('/get-session'), () =>
        HttpResponse.json({ ...session, user: { ...user, name } }),
      ),
      http.post(auth('/update-user'), async ({ request }) => {
        name = ((await request.json()) as { name: string }).name;
        return HttpResponse.json({ status: true });
      }),
    );
    renderApp('/account');

    const field = await screen.findByLabelText('Name');
    expect(field).toHaveValue('Ana Student');
    expect(screen.getByText(/Your email is ana@uni.test/)).toBeVisible();
    await userEvent.clear(field);
    await userEvent.type(field, '  Ana K  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByText('Name saved.')).toBeVisible();
    expect(name).toBe('Ana K');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ana K' }),
    ).toBeVisible();
  });

  it('asks for a name', async () => {
    setUp();
    renderApp('/account');

    await userEvent.clear(await screen.findByLabelText('Name'));
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('Enter your name')).toBeVisible();
  });

  it('changes the password and says what else it ends', async () => {
    setUp();
    const sent: unknown[] = [];
    server.use(
      http.post(auth('/change-password'), async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ token: 't2', user });
      }),
    );
    renderApp('/account');

    expect(
      await screen.findByText(
        'Changing it signs out your other devices, revokes your API keys and disconnects your AI apps.',
      ),
    ).toBeVisible();
    await userEvent.type(
      await screen.findByLabelText('Current password'),
      'old pass 1',
    );
    await userEvent.type(
      screen.getByLabelText(/^New password$/),
      'new pass 22',
    );
    await userEvent.type(
      screen.getByLabelText('New password again'),
      'new pass 22',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Change password' }),
    );

    expect(
      await screen.findByText('Password changed. This device stays signed in.'),
    ).toBeVisible();
    expect(sent).toEqual([
      {
        currentPassword: 'old pass 1',
        newPassword: 'new pass 22',
        revokeOtherSessions: true,
      },
    ]);
    expect(screen.getByLabelText('Current password')).toHaveValue('');
  });

  it('checks the new password before asking Better Auth', async () => {
    setUp();
    renderApp('/account');

    await userEvent.type(await screen.findByLabelText('Current password'), 'x');
    await userEvent.type(screen.getByLabelText(/^New password$/), 'short');
    await userEvent.type(screen.getByLabelText('New password again'), 'other');
    await userEvent.click(
      screen.getByRole('button', { name: 'Change password' }),
    );

    expect(await screen.findByText('Use at least 8 characters')).toBeVisible();
    expect(screen.getByText("The passwords don't match")).toBeVisible();
  });

  it('says a wrong current password next to its field', async () => {
    setUp();
    server.use(
      http.post(auth('/change-password'), () =>
        refused(400, 'INVALID_PASSWORD'),
      ),
    );
    renderApp('/account');

    await userEvent.type(
      await screen.findByLabelText('Current password'),
      'nope',
    );
    await userEvent.type(
      screen.getByLabelText(/^New password$/),
      'new pass 22',
    );
    await userEvent.type(
      screen.getByLabelText('New password again'),
      'new pass 22',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Change password' }),
    );

    expect(
      await screen.findByText("That's not your current password."),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('has no password form for a Google-only account', async () => {
    setUp({ accounts: ['google'] });
    renderApp('/account');

    expect(
      await screen.findByText(
        "You sign in with Google, so there's no password here to change.",
      ),
    ).toBeVisible();
    expect(screen.queryByLabelText('Current password')).toBeNull();
  });

  it('lists signed-in devices with this one marked, and signs another out', async () => {
    const state = setUp({
      sessions: [
        row('s2', safari, '2026-11-05T10:00:00.000Z'),
        row('s1', chrome, '2026-11-06T10:00:00.000Z'),
      ],
    });
    const revoked: unknown[] = [];
    server.use(
      http.post(auth('/revoke-session'), async ({ request }) => {
        revoked.push(await request.json());
        state.drop((s) => s.id !== 's2');
        return HttpResponse.json({ status: true });
      }),
    );
    renderApp('/account');

    const list = await screen.findByRole('list', { name: 'Signed-in devices' });
    const rows = within(list).getAllByRole('listitem');
    // this device first, whatever was active later
    expect(rows[0]).toHaveTextContent('Chrome on macOS');
    expect(rows[0]).toHaveTextContent('This device');
    expect(rows[0]).toHaveTextContent('203.0.113.7');
    expect(within(rows[0]!).queryByRole('button')).toBeNull();
    expect(rows[1]).toHaveTextContent('Safari on iOS');

    await userEvent.click(
      within(rows[1]!).getByRole('button', { name: 'Sign out Safari on iOS' }),
    );
    await vi.waitFor(() =>
      expect(within(list).getAllByRole('listitem')).toHaveLength(1),
    );
    expect(revoked).toEqual([{ token: 'token-s2' }]);
    // nothing else to sign out
    expect(
      screen.queryByRole('button', { name: 'Sign out everywhere else' }),
    ).toBeNull();
  });

  it('signs out everywhere else after a confirm', async () => {
    const state = setUp({
      sessions: [
        row('s1', chrome, '2026-11-06T10:00:00.000Z'),
        row('s2', safari, '2026-11-05T10:00:00.000Z'),
        row('s3', '', '2026-11-04T10:00:00.000Z'),
      ],
    });
    let called = false;
    server.use(
      http.post(auth('/revoke-other-sessions'), () => {
        called = true;
        state.drop((s) => s.id === 's1');
        return HttpResponse.json({ status: true });
      }),
    );
    renderApp('/account');

    const list = await screen.findByRole('list', { name: 'Signed-in devices' });
    expect(within(list).getByText('Unknown device')).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Sign out everywhere else' }),
    );
    expect(called).toBe(false);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out others' }),
    );

    expect(
      await screen.findByText('Signed out everywhere else.'),
    ).toBeVisible();
    expect(called).toBe(true);
    await vi.waitFor(() =>
      expect(within(list).getAllByRole('listitem')).toHaveLength(1),
    );
  });

  it('deletes the account with the password, then goes to sign in', async () => {
    setUp();
    const sent: unknown[] = [];
    server.use(
      http.post(auth('/delete-user'), async ({ request }) => {
        sent.push(await request.json());
        // the cookie is gone with the account
        server.use(
          http.get(auth('/get-session'), () => HttpResponse.json(null)),
        );
        return HttpResponse.json({ success: true, message: 'User deleted' });
      }),
    );
    const { router } = renderApp('/account');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete account…' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Delete your account?',
    });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete account' }),
    );
    expect(
      await within(dialog).findByText('Enter your password'),
    ).toBeVisible();
    expect(sent).toEqual([]);

    await userEvent.type(
      within(dialog).getByLabelText('Your password'),
      'pw 12345',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete account' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Sign in to UniHub' }),
    ).toBeVisible();
    expect(sent).toEqual([{ password: 'pw 12345' }]);
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(await screen.findByText('Your account is deleted.')).toBeVisible();
  });

  it('says a wrong password next to its field, and keeps the account', async () => {
    setUp();
    server.use(
      http.post(auth('/delete-user'), () => refused(400, 'INVALID_PASSWORD')),
    );
    renderApp('/account');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete account…' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(
      within(dialog).getByLabelText('Your password'),
      'nope',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete account' }),
    );

    expect(
      await within(dialog).findByText("That's not your current password."),
    ).toBeVisible();
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('asks to sign in again when the session is too old to delete', async () => {
    setUp({ accounts: ['google'] });
    const sent: unknown[] = [];
    server.use(
      http.post(auth('/delete-user'), async ({ request }) => {
        sent.push(await request.json());
        return refused(400, 'SESSION_EXPIRED');
      }),
    );
    renderApp('/account');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete account…' }),
    );
    const dialog = await screen.findByRole('dialog');
    // no password to ask for
    expect(within(dialog).queryByLabelText('Your password')).toBeNull();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete account' }),
    );

    expect(
      await within(dialog).findByRole('button', { name: 'Sign in again' }),
    ).toBeVisible();
    expect(sent).toEqual([{}]);
  });
});
