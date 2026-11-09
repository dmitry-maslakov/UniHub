import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from './render';
import { auth, server, signedInAsAdmin } from './server';

const api = (path: string) => `http://localhost:3000/api${path}`;

const link = (over: object = {}) => ({
  portal: 'courses',
  label: 'Course site',
  mode: 'shared',
  instance: null,
  externalId: '1388',
  year: 2026,
  unlinkable: true,
  name: 'OS 2026/27',
  ...over,
});

const os = {
  id: 'c1',
  slug: 'os',
  name: 'Operativni sistemi',
  readers: 1,
  links: [
    link(),
    link({
      portal: 'canvas',
      label: 'Canvas',
      mode: 'token',
      instance: 'https://canvas.example.edu',
      externalId: '297',
      year: null,
      unlinkable: false,
      name: null,
    }),
    link({
      portal: 'catalog',
      label: 'Course catalog',
      mode: 'public',
      externalId: 'os-open',
      year: 2025,
      name: 'OS open',
    }),
  ],
};
const ar = {
  id: 'c2',
  slug: 'ar',
  name: 'Arhitektura računara',
  readers: 0,
  links: [],
};

const ana = {
  userId: 'u2',
  name: 'Ana Student',
  email: 'ana@uni.test',
  banned: false,
};

// the hub's courses, as a list the test can change
function hub(courses: object[] = [os, ar]) {
  const state = { courses };
  server.use(
    http.get(api('/admin/courses'), () => HttpResponse.json(state.courses)),
    http.get(api('/admin/queues'), () =>
      HttpResponse.json([
        { name: 'plugins', waiting: 12, active: 2, failed: 0 },
        { name: 'models', waiting: 340, active: 1, failed: 3 },
      ]),
    ),
  );
  return state;
}

describe('admin, courses', () => {
  it('lists hub courses with their portal courses and readers', async () => {
    signedInAsAdmin();
    hub();
    renderApp('/admin/courses');

    const list = await screen.findByRole('list', { name: 'Courses' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(
      'Operativni sistemi/courses/os · 3 portal courses · 1 reader',
    );
    expect(rows[1]).toHaveTextContent(
      'Arhitektura računara/courses/ar · 0 portal courses · 0 readers',
    );
    expect(
      within(rows[0]!).getByRole('link', { name: /Operativni sistemi/ }),
    ).toHaveAttribute('href', '/admin/courses/c1');
  });

  it('shows the background queues', async () => {
    signedInAsAdmin();
    hub();
    renderApp('/admin/courses');

    const table = await screen.findByRole('table', {
      name: 'Background queues',
    });
    expect(
      within(table).getByRole('row', { name: /models 340 1 3/ }),
    ).toBeVisible();
    expect(
      within(table).getByRole('row', { name: /plugins 12 2 0/ }),
    ).toBeVisible();
  });

  it('says there is no course yet', async () => {
    signedInAsAdmin();
    hub([]);
    renderApp('/admin/courses');

    expect(await screen.findByText('No courses yet')).toBeVisible();
  });

  it('suggests an address from the name, creates the course and opens it', async () => {
    signedInAsAdmin();
    const state = hub([]);
    const bodies: unknown[] = [];
    server.use(
      http.post(api('/courses'), async ({ request }) => {
        bodies.push(await request.json());
        state.courses = [{ ...ar, id: 'c9' }];
        return HttpResponse.json({ id: 'c9' }, { status: 201 });
      }),
      http.get(api('/admin/courses/c9/readers'), () => HttpResponse.json([])),
    );
    const { router } = renderApp('/admin/courses');

    await userEvent.type(
      await screen.findByLabelText('Name'),
      'Arhitektura računara 2',
    );
    expect(screen.getByLabelText('Address')).toHaveValue(
      'arhitektura-racunara-2',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Create course' }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Arhitektura računara',
        level: 1,
      }),
    ).toBeVisible();
    expect(bodies).toEqual([
      { slug: 'arhitektura-racunara-2', name: 'Arhitektura računara 2' },
    ]);
    expect(router.state.location.pathname).toBe('/admin/courses/c9');
  });

  it('keeps an address that was edited', async () => {
    signedInAsAdmin();
    hub([]);
    renderApp('/admin/courses');

    const address = await screen.findByLabelText('Address');
    await userEvent.type(address, 'ar');
    await userEvent.type(screen.getByLabelText('Name'), 'Arhitektura');

    expect(address).toHaveValue('ar');
  });

  it('asks for a name and an address the hub takes', async () => {
    signedInAsAdmin();
    hub([]);
    renderApp('/admin/courses');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Create course' }),
    );
    expect(await screen.findByText('Name the course')).toBeVisible();
    expect(
      screen.getByText('Use lower-case letters, digits and single dashes'),
    ).toBeVisible();
  });

  it('says another course has that address', async () => {
    signedInAsAdmin();
    hub();
    server.use(
      http.post(api('/courses'), () =>
        HttpResponse.json({ code: 'COURSE_SLUG_TAKEN' }, { status: 409 }),
      ),
    );
    renderApp('/admin/courses');

    await userEvent.type(
      await screen.findByLabelText('Name'),
      'Operativni sistemi',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Create course' }),
    );

    expect(
      await screen.findByText('Another course has this address'),
    ).toBeVisible();
  });

  it('is the not found page for a course nobody made', async () => {
    signedInAsAdmin();
    hub();
    renderApp('/admin/courses/nope');

    expect(
      await screen.findByRole('heading', { name: 'Course not found' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'All courses' })).toHaveAttribute(
      'href',
      '/admin/courses',
    );
  });

  describe('a course', () => {
    const open = (readers: object[] = [ana]) => {
      signedInAsAdmin();
      const state = hub();
      const found = { readers };
      server.use(
        http.get(api('/admin/courses/c1/readers'), () =>
          HttpResponse.json(found.readers),
        ),
        http.get(api('/admin/portal-courses'), () =>
          HttpResponse.json({ total: 0, portalCourses: [] }),
        ),
        http.get(auth('/admin/list-users'), () =>
          HttpResponse.json({ users: [], total: 0, limit: 20, offset: 0 }),
        ),
      );
      renderApp('/admin/courses/c1');
      return { state, found };
    };

    it("names portals by the hub's labels, a shared one's too", async () => {
      open();

      const list = await screen.findByRole('list', {
        name: 'Linked portal courses',
      });
      const rows = within(list).getAllByRole('listitem');
      expect(rows[0]).toHaveTextContent('OS 2026/27Course site · 2026/27');
      expect(rows[2]).toHaveTextContent('OS openCourse catalog · 2025/26');
    });

    it("shows a token portal's link by its id alone", async () => {
      open();

      const list = await screen.findByRole('list', {
        name: 'Linked portal courses',
      });
      const row = within(list).getAllByRole('listitem')[1]!;
      expect(row).toHaveTextContent(
        "297Canvas · canvas.example.edu · Every year · Read by users' own accounts",
      );
    });

    it("says a public site's course shows only to whoever picked it", async () => {
      open();

      const list = await screen.findByRole('list', {
        name: 'Linked portal courses',
      });
      expect(
        within(within(list).getAllByRole('listitem')[2]!).getByText(
          /Shown to whoever picked it/,
        ),
      ).toBeVisible();
      expect(
        screen.getByText(
          /A public site's course linked here shows here for everyone who picked it/,
        ),
      ).toBeVisible();
    });

    it('links a portal course found by name, with its year', async () => {
      open();
      const asked: URLSearchParams[] = [];
      const bodies: unknown[] = [];
      server.use(
        http.get(api('/admin/portal-courses'), ({ request }) => {
          asked.push(new URL(request.url).searchParams);
          return HttpResponse.json({
            total: 2,
            portalCourses: [
              {
                portal: 'courses',
                label: 'Course site',
                mode: 'shared',
                externalId: '77',
                name: 'Računarske mreže',
                course: null,
              },
              {
                portal: 'catalog',
                label: 'Course catalog',
                mode: 'public',
                externalId: 'net',
                name: 'Računarske mreže 2',
                course: { id: 'c2', slug: 'ar', name: 'Arhitektura računara' },
              },
            ],
          });
        }),
        http.put(
          api('/portal-courses/courses/77/course'),
          async ({ request }) => {
            bodies.push(await request.json());
            return new HttpResponse(null, { status: 204 });
          },
        ),
      );

      const box = await screen.findByRole('combobox', {
        name: 'Portal course',
      });
      await userEvent.type(box, 'mre');
      await waitFor(() =>
        expect(asked.some((p) => p.get('q') === 'mre')).toBe(true),
      );
      expect(
        await screen.findByRole('option', {
          name: 'Računarske mreže 2 · Course catalog (in Arhitektura računara)',
        }),
      ).toBeVisible();
      await userEvent.click(
        screen.getByRole('option', { name: 'Računarske mreže · Course site' }),
      );
      await userEvent.type(screen.getByLabelText('Academic year'), '2027');
      await userEvent.click(screen.getByRole('button', { name: 'Link' }));

      expect(await screen.findByText('Linked.')).toBeVisible();
      expect(bodies).toEqual([{ course: 'os', year: 2027 }]);
      expect(asked.every((p) => p.get('limit') === '50')).toBe(true);
    });

    it('links a portal course for every year', async () => {
      open();
      const bodies: unknown[] = [];
      server.use(
        http.get(api('/admin/portal-courses'), () =>
          HttpResponse.json({
            total: 1,
            portalCourses: [
              {
                portal: 'courses',
                label: 'Course site',
                mode: 'shared',
                externalId: '77',
                name: 'Računarske mreže',
                course: null,
              },
            ],
          }),
        ),
        http.put(
          api('/portal-courses/courses/77/course'),
          async ({ request }) => {
            bodies.push(await request.json());
            return new HttpResponse(null, { status: 204 });
          },
        ),
      );

      await userEvent.click(
        await screen.findByRole('combobox', { name: 'Portal course' }),
      );
      await userEvent.click(
        await screen.findByRole('option', {
          name: 'Računarske mreže · Course site',
        }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Link' }));

      await screen.findByText('Linked.');
      expect(bodies).toEqual([{ course: 'os', year: null }]);
    });

    it('offers an unlink only where it reaches the link', async () => {
      open();
      const list = await screen.findByRole('list', {
        name: 'Linked portal courses',
      });
      const rows = within(list).getAllByRole('listitem');
      expect(within(rows[0]!).getByRole('button')).toBeVisible();
      expect(within(rows[1]!).queryByRole('button')).toBeNull();
    });

    it('does not link a year it cannot read as one', async () => {
      open();
      const bodies: unknown[] = [];
      server.use(
        http.get(api('/admin/portal-courses'), () =>
          HttpResponse.json({
            total: 1,
            portalCourses: [
              {
                portal: 'courses',
                label: 'Course site',
                mode: 'shared',
                externalId: '77',
                name: 'Računarske mreže',
                course: null,
              },
            ],
          }),
        ),
        http.put(
          api('/portal-courses/courses/77/course'),
          async ({ request }) => {
            bodies.push(await request.json());
            return new HttpResponse(null, { status: 204 });
          },
        ),
      );

      await userEvent.click(
        await screen.findByRole('combobox', { name: 'Portal course' }),
      );
      await userEvent.click(
        await screen.findByRole('option', {
          name: 'Računarske mreže · Course site',
        }),
      );
      await userEvent.type(screen.getByLabelText('Academic year'), '26');
      await userEvent.click(screen.getByRole('button', { name: 'Link' }));

      expect(
        await screen.findByText(/Enter a year from 1901 to 2999/),
      ).toBeVisible();
      expect(bodies).toEqual([]);
    });

    it('unlinks after a confirm', async () => {
      open();
      const deleted: string[] = [];
      server.use(
        http.delete(
          api('/portal-courses/courses/1388/course'),
          ({ request }) => {
            deleted.push(new URL(request.url).pathname);
            return new HttpResponse(null, { status: 204 });
          },
        ),
      );

      const list = await screen.findByRole('list', {
        name: 'Linked portal courses',
      });
      await userEvent.click(
        within(within(list).getAllByRole('listitem')[0]!).getByRole('button', {
          name: 'Unlink OS 2026/27',
        }),
      );
      expect(await screen.findByText('Unlink OS 2026/27?')).toBeVisible();
      expect(deleted).toEqual([]);
      await userEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: 'Unlink',
        }),
      );

      expect(await screen.findByText('Unlinked.')).toBeVisible();
      expect(deleted).toEqual(['/api/portal-courses/courses/1388/course']);
    });

    it('gives a user access and takes it back', async () => {
      const { found } = open([]);
      const puts: string[] = [];
      const deletes: string[] = [];
      server.use(
        http.get(auth('/admin/list-users'), ({ request }) => {
          const { searchParams } = new URL(request.url);
          expect(searchParams.get('limit')).toBe('20');
          return HttpResponse.json({
            users: [
              {
                id: 'u2',
                name: 'Ana Student',
                email: 'ana@uni.test',
                emailVerified: true,
                createdAt: '2026-11-01T10:00:00.000Z',
              },
            ],
            total: 1,
            limit: 20,
            offset: 0,
          });
        }),
        http.put(api('/users/u2/courses/c1'), ({ request }) => {
          puts.push(new URL(request.url).pathname);
          found.readers = [ana];
          return new HttpResponse(null, { status: 204 });
        }),
        http.delete(api('/users/u2/courses/c1'), ({ request }) => {
          deletes.push(new URL(request.url).pathname);
          found.readers = [];
          return new HttpResponse(null, { status: 204 });
        }),
      );

      expect(await screen.findByText('No one yet')).toBeVisible();
      await userEvent.click(screen.getByRole('combobox', { name: 'User' }));
      await userEvent.click(
        await screen.findByRole('option', {
          name: 'Ana Student · ana@uni.test',
        }),
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Give access' }),
      );

      expect(
        await screen.findByText('Ana Student can read this course now.'),
      ).toBeVisible();
      const readers = await screen.findByRole('list', { name: 'Readers' });
      expect(within(readers).getByText('ana@uni.test')).toBeVisible();
      expect(puts).toEqual(['/api/users/u2/courses/c1']);

      await userEvent.click(
        within(readers).getByRole('button', {
          name: 'Remove access for Ana Student',
        }),
      );
      expect(
        await screen.findByText("Remove Ana Student's access?"),
      ).toBeVisible();
      await userEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: 'Remove access',
        }),
      );

      expect(
        await screen.findByText("Ana Student's access is removed."),
      ).toBeVisible();
      await waitFor(() => expect(screen.getByText('No one yet')).toBeVisible());
      expect(deletes).toEqual(['/api/users/u2/courses/c1']);
    });

    it('marks a banned reader', async () => {
      open([{ ...ana, banned: true }]);

      const readers = await screen.findByRole('list', { name: 'Readers' });
      expect(within(readers).getByText('Banned')).toBeVisible();
    });

    it('says so when a change does not go through', async () => {
      open();
      server.use(
        http.delete(api('/users/u2/courses/c1'), () =>
          HttpResponse.json({ code: 'UNKNOWN_USER' }, { status: 404 }),
        ),
      );

      const readers = await screen.findByRole('list', { name: 'Readers' });
      await userEvent.click(
        within(readers).getByRole('button', {
          name: 'Remove access for Ana Student',
        }),
      );
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'Remove access',
        }),
      );

      expect(
        await screen.findByText("That didn't go through. Try again."),
      ).toBeVisible();
    });
  });
});
