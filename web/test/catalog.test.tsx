import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from './render';
import { server, signedIn } from './server';

const api = (path: string) => `http://localhost:3000/api${path}`;

const portal = {
  portal: 'catalog',
  label: 'Course catalog',
  mode: 'public',
  linked: false,
  status: null,
  expiresAt: null,
  picked: 0,
};
const course = (externalId: string, name: string, isNew = false) => ({
  externalId,
  name,
  url: `https://courses.example.edu/${externalId}`,
  picked: false,
  isNew,
});
const courses = [
  course('os', 'Operativni sistemi', true),
  // what its connector sent, which the hub took as it came
  { ...course('net', 'Računarske mreže'), url: 'data:text/html,<p>hi</p>' },
];

// the hub's catalog of the portal, picks kept as the routes make them
function hub() {
  const picks = new Set<string>();
  const asked: URLSearchParams[] = [];
  server.use(
    http.get(api('/me/portals'), () =>
      HttpResponse.json([{ ...portal, picked: picks.size }]),
    ),
    http.get(api('/portals/catalog/catalog'), ({ request }) => {
      const query = new URL(request.url).searchParams;
      asked.push(query);
      const q = query.get('q')?.toLowerCase();
      const found = courses
        .filter((c) => !q || c.name.toLowerCase().includes(q))
        .map((c) => ({ ...c, picked: picks.has(c.externalId) }));
      return HttpResponse.json({ total: found.length, courses: found });
    }),
    http.put(api('/me/picks/catalog/:id'), ({ params }) => {
      picks.add(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(api('/me/picks/catalog/:id'), ({ params }) => {
      picks.delete(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { picks, asked };
}

describe('a public portal’s catalog', () => {
  it('lists its courses with what is new, and picks and unpicks one', async () => {
    signedIn();
    const { picks } = hub();
    renderApp('/settings/portals');

    const list = await screen.findByRole('list', { name: 'Course catalog' });
    expect(within(list).getByText('New')).toBeVisible();
    expect(screen.getByText('None picked')).toBeVisible();

    await userEvent.click(
      within(list).getByRole('checkbox', { name: 'Operativni sistemi' }),
    );
    expect(await screen.findByText('1 picked')).toBeVisible();
    expect(picks).toEqual(new Set(['os']));
    expect(
      within(list).getByRole('checkbox', { name: 'Operativni sistemi' }),
    ).toBeChecked();

    await userEvent.click(
      within(list).getByRole('checkbox', { name: 'Operativni sistemi' }),
    );
    expect(await screen.findByText('None picked')).toBeVisible();
    expect(picks.size).toBe(0);
  });

  it('links a course to its site only by a web address', async () => {
    signedIn();
    hub();
    renderApp('/settings/portals');

    expect(
      await screen.findByRole('link', {
        name: 'Open Operativni sistemi on its site',
      }),
    ).toHaveAttribute('href', 'https://courses.example.edu/os');
    expect(
      screen.queryByRole('link', { name: 'Open Računarske mreže on its site' }),
    ).toBeNull();
  });

  it('asks the hub for the courses whose names have the words', async () => {
    signedIn();
    const { asked } = hub();
    renderApp('/settings/portals');

    await userEvent.type(
      await screen.findByLabelText('Find a course'),
      'mreže',
    );
    await waitFor(() => expect(asked.at(-1)?.get('q')).toBe('mreže'));
    const list = await screen.findByRole('list', { name: 'Course catalog' });
    await waitFor(() =>
      expect(within(list).queryByText('Operativni sistemi')).toBeNull(),
    );
    expect(within(list).getByText('Računarske mreže')).toBeVisible();

    await userEvent.clear(screen.getByLabelText('Find a course'));
    await userEvent.type(screen.getByLabelText('Find a course'), 'fizika');
    expect(await screen.findByText(/No course's name has/)).toBeVisible();
  });

  it('says what to do when a pick is refused, and leaves the box as it was', async () => {
    signedIn();
    hub();
    server.use(
      http.put(api('/me/picks/catalog/:id'), () =>
        HttpResponse.json(
          { statusCode: 422, code: 'TOO_MANY_PICKS' },
          { status: 422 },
        ),
      ),
    );
    renderApp('/settings/portals');

    const box = await screen.findByRole('checkbox', {
      name: 'Računarske mreže',
    });
    await userEvent.click(box);
    expect(await screen.findByText(/up to 100 courses/)).toBeVisible();
    expect(box).not.toBeChecked();
  });
});
