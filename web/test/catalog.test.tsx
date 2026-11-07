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
  into: null,
  suggestedInto: null,
});
const courses = [
  course('os', 'Operativni sistemi', true),
  // what its connector sent, which the hub took as it came
  { ...course('net', 'Računarske mreže'), url: 'data:text/html,<p>hi</p>' },
];

// a course the user reads, through their own account or not
interface Course {
  slug: string;
  name: string;
  sources: string[];
  portalCourses: {
    portal: string;
    externalId: string;
    name: string;
    url: string | null;
    year: number | null;
    via: string;
  }[];
}
const mine = (slug: string, name: string, via = 'account'): Course => ({
  slug,
  name,
  sources: ['lms'],
  portalCourses: [
    { portal: 'lms', externalId: slug, name, url: null, year: 2026, via },
  ],
});

// The hub's catalog of the portal, picks kept as the routes make them, and
// the course each is shown with; the user's courses, and the one os is
// suggested to go with
function hub({
  own = [] as Course[],
  suggested = null as string | null,
  picked = [] as string[],
} = {}) {
  const picks = new Set<string>(picked);
  const into = new Map<string, string | null>();
  const sent: unknown[] = [];
  const asked: URLSearchParams[] = [];
  server.use(
    http.get(api('/me/portals'), () =>
      HttpResponse.json([{ ...portal, picked: picks.size }]),
    ),
    http.get(api('/courses'), () => HttpResponse.json(own)),
    http.get(api('/portals/catalog/catalog'), ({ request }) => {
      const query = new URL(request.url).searchParams;
      asked.push(query);
      const q = query.get('q')?.toLowerCase();
      const found = courses
        .filter((c) => !q || c.name.toLowerCase().includes(q))
        .map((c) => {
          const on = picks.has(c.externalId);
          return {
            ...c,
            picked: on,
            into: (on && into.get(c.externalId)) || null,
            suggestedInto: on && c.externalId === 'os' ? suggested : null,
          };
        });
      return HttpResponse.json({ total: found.length, courses: found });
    }),
    http.put(api('/me/picks/catalog/:id'), async ({ params, request }) => {
      const body = (await request.text()) || null;
      sent.push(body && JSON.parse(body));
      picks.add(String(params.id));
      if (body) into.set(String(params.id), JSON.parse(body).into);
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(api('/me/picks/catalog/:id'), ({ params }) => {
      picks.delete(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { picks, asked, sent };
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

  it('shows a picked course with one of her own, the suggested one first and marked, and on its own again', async () => {
    signedIn();
    const { sent } = hub({
      own: [
        mine('lms~algebra', 'Algebra'),
        mine('lms~os', 'Operating systems'),
        mine('admins', 'From the hub', 'link'),
      ],
      suggested: 'lms~os',
      picked: ['os'],
    });
    renderApp('/settings/portals');

    const select = await screen.findByLabelText('Show with');
    // on its own until she says otherwise; a course she reads only through
    // the hub isn't one to show it with
    expect(select).toHaveValue('');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['On its own', 'Operating systems', 'Algebra']);
    expect(
      within(select).getByRole('group', { name: 'Suggested' }),
    ).toContainElement(
      within(select).getByRole('option', { name: 'Operating systems' }),
    );
    expect(
      screen.getByText(/Operating systems has some of the same files/),
    ).toBeVisible();
    // only the picked course has one
    expect(screen.getAllByLabelText('Show with')).toHaveLength(1);

    await userEvent.selectOptions(select, 'lms~os');
    await waitFor(() => expect(select).toHaveValue('lms~os'));
    await userEvent.selectOptions(select, '');
    await waitFor(() => expect(select).toHaveValue(''));
    expect(sent).toEqual([{ into: 'lms~os' }, { into: null }]);
  });

  it('offers nothing to show a pick with to a user with no course of her own', async () => {
    signedIn();
    hub({ own: [mine('admins', 'From the hub', 'link')], picked: ['os'] });
    const { queryClient } = renderApp('/settings/portals');

    expect(
      await screen.findByRole('checkbox', { name: 'Operativni sistemi' }),
    ).toBeChecked();
    await waitFor(() =>
      expect(
        queryClient.getQueryCache().find({ queryKey: ['get', '/api/courses'] })
          ?.state.status,
      ).toBe('success'),
    );
    expect(screen.queryByLabelText('Show with')).toBeNull();
  });

  it('names the course an admin linked a pick to, with nothing to choose', async () => {
    signedIn();
    const algorithms = mine('algo', 'Algorithms', 'link');
    hub({
      own: [
        mine('lms~algebra', 'Algebra'),
        {
          ...algorithms,
          portalCourses: [
            ...algorithms.portalCourses,
            {
              portal: 'catalog',
              externalId: 'os',
              name: 'Operativni sistemi',
              url: null,
              year: null,
              via: 'pick',
            },
          ],
        },
      ],
      picked: ['os'],
    });
    renderApp('/settings/portals');

    expect(
      await screen.findByText('Shown with Algorithms, as an admin linked it.'),
    ).toBeVisible();
    expect(screen.queryByLabelText('Show with')).toBeNull();
  });
});
