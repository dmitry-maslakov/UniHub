import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from './render';
import { auth, server, signedIn, signedInAsAdmin, user } from './server';

const person = (n: number, over: object = {}) => ({
  id: `p${n}`,
  name: `Person ${n}`,
  email: `person${n}@uni.test`,
  emailVerified: true,
  image: null,
  createdAt: `2026-11-0${Math.min(n, 9)}T10:00:00.000Z`,
  updatedAt: `2026-11-0${Math.min(n, 9)}T10:00:00.000Z`,
  role: 'user',
  banned: false,
  banReason: null,
  banExpires: null,
  ...over,
});

const me = { ...person(0, { role: 'admin' }), id: user.id, name: user.name };

// the users the hub lists, and the queries asked
function users(list: ReturnType<typeof person>[], total = list.length) {
  const asked: URLSearchParams[] = [];
  server.use(
    http.get(auth('/admin/list-users'), ({ request }) => {
      asked.push(new URL(request.url).searchParams);
      return HttpResponse.json({ users: list, total, limit: 50, offset: 0 });
    }),
  );
  return asked;
}

// the body of the one POST to a path
function accepts(path: string) {
  const bodies: unknown[] = [];
  server.use(
    http.post(auth(path), async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ user: person(2) });
    }),
  );
  return bodies;
}

const actionsOf = async (name: string) => {
  await userEvent.click(
    await screen.findByRole('button', { name: `Actions for ${name}` }),
  );
  return within(document.body);
};

describe('admin, users', () => {
  it('is not there for others', async () => {
    signedIn();
    renderApp('/admin/users');

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  });

  it('has Admin in the navigation for admins, and opens the users', async () => {
    signedInAsAdmin();
    users([me]);
    const { router } = renderApp('/admin');

    expect(
      await screen.findByRole('heading', { name: 'Admin', level: 1 }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/admin/users');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Admin' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('lists users newest first, with their role and state', async () => {
    signedInAsAdmin();
    const asked = users([
      me,
      person(3, { name: 'Boris', role: 'user,admin' }),
      person(2, {
        name: 'Cana',
        banned: true,
        banExpires: '2026-12-01T10:00:00.000Z',
      }),
      person(1, { name: 'Dado', emailVerified: false }),
    ]);
    renderApp('/admin/users');

    const list = await screen.findByRole('list', { name: 'Users' });
    expect(screen.getByText('4 users')).toBeVisible();
    const rows = within(list).getAllByRole('listitem');
    ['Ana Student', 'Boris', 'Cana', 'Dado'].forEach((name, i) =>
      expect(rows[i]).toHaveTextContent(new RegExp(`^${name}`)),
    );
    expect(within(rows[0]!).getByText('You')).toBeVisible();
    expect(within(rows[1]!).getByText('Admin')).toBeVisible();
    expect(within(rows[2]!).getByText('Banned')).toBeVisible();
    expect(
      within(rows[2]!).getByText(/Banned until Dec 1, 2026/),
    ).toBeVisible();
    expect(within(rows[3]!).getByText(/Email not confirmed/)).toBeVisible();
    expect(asked[0]!.get('sortBy')).toBe('createdAt');
    expect(asked[0]!.get('sortDirection')).toBe('desc');
    expect(asked[0]!.get('limit')).toBe('50');
  });

  it('searches by email or by name, and keeps the search in the address', async () => {
    signedInAsAdmin();
    const asked = users([me]);
    const { router } = renderApp('/admin/users');
    const box = await screen.findByRole('searchbox', { name: 'Search users' });

    await userEvent.type(box, 'ana@uni');
    await waitFor(() => expect(asked.at(-1)!.get('searchField')).toBe('email'));
    expect(asked.at(-1)!.get('searchValue')).toBe('ana@uni');
    expect(asked.at(-1)!.get('searchOperator')).toBe('contains');
    expect(router.state.location.search).toEqual({ q: 'ana@uni' });

    await userEvent.clear(box);
    await userEvent.type(box, 'Ana');
    await waitFor(() => expect(asked.at(-1)!.get('searchField')).toBe('name'));
    expect(router.state.location.search).toEqual({ q: 'Ana' });
  });

  it('says no user matches', async () => {
    signedInAsAdmin();
    users([], 0);
    renderApp('/admin/users?q=zzz');

    expect(await screen.findByText('No user matches “zzz”')).toBeVisible();
    expect(screen.getByRole('searchbox', { name: 'Search users' })).toHaveValue(
      'zzz',
    );
  });

  it('pages through users', async () => {
    signedInAsAdmin();
    const asked = users([me], 120);
    const { router } = renderApp('/admin/users');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Page 2' }),
    );

    await waitFor(() => expect(asked.at(-1)!.get('offset')).toBe('50'));
    expect(router.state.location.search).toEqual({ page: '2' });
  });

  it('makes a user an admin after a confirm', async () => {
    signedInAsAdmin();
    users([me, person(2, { name: 'Boris' })]);
    const bodies = accepts('/admin/set-role');
    renderApp('/admin/users');

    const menu = await actionsOf('Boris');
    await userEvent.click(
      await menu.findByRole('menuitem', { name: 'Make admin' }),
    );
    expect(await screen.findByText('Make Boris an admin?')).toBeVisible();
    expect(bodies).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Make admin' }));

    expect(await screen.findByText('Boris is an admin now.')).toBeVisible();
    expect(bodies).toEqual([{ userId: 'p2', role: 'admin' }]);
  });

  it('takes admin away after a confirm', async () => {
    signedInAsAdmin();
    users([me, person(2, { name: 'Boris', role: 'admin' })]);
    const bodies = accepts('/admin/set-role');
    renderApp('/admin/users');

    const menu = await actionsOf('Boris');
    await userEvent.click(
      await menu.findByRole('menuitem', { name: 'Remove admin' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove admin' }),
    );

    expect(
      await screen.findByText('Boris is no longer an admin.'),
    ).toBeVisible();
    expect(bodies).toEqual([{ userId: 'p2', role: 'user' }]);
  });

  it('bans a user for a week, with a reason', async () => {
    signedInAsAdmin();
    users([me, person(2, { name: 'Boris' })]);
    const bodies = accepts('/admin/ban-user');
    renderApp('/admin/users');

    const menu = await actionsOf('Boris');
    await userEvent.click(await menu.findByRole('menuitem', { name: 'Ban…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ban Boris?' });
    await userEvent.click(
      within(dialog).getByRole('combobox', { name: 'For how long' }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: 'One week' }),
    );
    await userEvent.type(
      within(dialog).getByLabelText('Reason'),
      'Shared a key',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ban' }));

    expect(await screen.findByText('Boris is banned.')).toBeVisible();
    expect(bodies).toEqual([
      { userId: 'p2', banReason: 'Shared a key', banExpiresIn: 604800 },
    ]);
  });

  it('bans for good unless told otherwise', async () => {
    signedInAsAdmin();
    users([me, person(2, { name: 'Boris' })]);
    const bodies = accepts('/admin/ban-user');
    renderApp('/admin/users');

    const menu = await actionsOf('Boris');
    await userEvent.click(await menu.findByRole('menuitem', { name: 'Ban…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ban Boris?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ban' }));

    await screen.findByText('Boris is banned.');
    expect(bodies).toEqual([{ userId: 'p2' }]);
  });

  it('unbans a user', async () => {
    signedInAsAdmin();
    users([me, person(2, { name: 'Boris', banned: true })]);
    const bodies = accepts('/admin/unban-user');
    renderApp('/admin/users');

    const menu = await actionsOf('Boris');
    await userEvent.click(await menu.findByRole('menuitem', { name: 'Unban' }));

    expect(await screen.findByText('Boris is unbanned.')).toBeVisible();
    expect(bodies).toEqual([{ userId: 'p2' }]);
  });

  it('says so when a change does not go through', async () => {
    signedInAsAdmin();
    users([me, person(2, { name: 'Boris', banned: true })]);
    server.use(
      http.post(auth('/admin/unban-user'), () =>
        HttpResponse.json({ code: 'FORBIDDEN' }, { status: 403 }),
      ),
    );
    renderApp('/admin/users');

    const menu = await actionsOf('Boris');
    await userEvent.click(await menu.findByRole('menuitem', { name: 'Unban' }));

    expect(
      await screen.findByText("That didn't go through. Try again."),
    ).toBeVisible();
  });

  it('offers no actions on yourself', async () => {
    signedInAsAdmin();
    users([me, person(2, { name: 'Boris' })]);
    renderApp('/admin/users');

    await screen.findByText('Boris');
    expect(
      screen.getByRole('button', { name: 'Actions for Boris' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Actions for Ana Student' }),
    ).toBeNull();
  });
});
