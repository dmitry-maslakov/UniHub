import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from './render';
import { server, signedIn } from './server';

const api = (path: string) => `http://localhost:3000/api${path}`;

const post = (n: number, raw: object | null = {}) => ({
  id: `i${n}`,
  portal: 'canvas',
  kind: 'announcement',
  title: `Post ${n}`,
  url: null,
  publishedAt: '2026-11-01T10:00:00.000Z',
  raw,
});

const file = (n: number, hasContent = true) => ({
  id: `f${n}`,
  portal: 'canvas',
  itemId: null,
  name: `file-${n}.pdf`,
  path: 'lectures',
  url: null,
  size: 1_400_000,
  mime: 'application/pdf',
  hasContent,
});

const posts = Array.from({ length: 51 }, (_, i) => post(i + 1));
const offsets: number[] = [];

const setup = (items: unknown[] = posts, files: unknown[] = []) => {
  signedIn();
  offsets.length = 0;
  server.use(
    http.get(api('/courses'), () =>
      HttpResponse.json([
        {
          slug: 'os',
          name: 'Operating systems',
          sources: [],
          portalCourses: [],
        },
      ]),
    ),
    http.get(api('/courses/os/items'), ({ request }) => {
      const offset = Number(
        new URL(request.url).searchParams.get('offset') ?? 0,
      );
      offsets.push(offset);
      return HttpResponse.json(items.slice(offset, offset + 50));
    }),
    http.get(api('/courses/os/files'), () => HttpResponse.json(files)),
    http.get(api('/me/portals'), () => HttpResponse.json([])),
  );
};

describe('course page', () => {
  it('shows a full page of posts, and the next one on request', async () => {
    setup();
    renderApp('/courses/os');

    expect(await screen.findByText('Post 50')).toBeVisible();
    expect(screen.queryByText('Post 51')).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Show more posts' }),
    );

    expect(await screen.findByText('Post 51')).toBeVisible();
    expect(offsets).toEqual([0, 50]);
    expect(
      screen.queryByRole('button', { name: 'Show more posts' }),
    ).toBeNull();
  });

  it('says when the next page of posts fails, and loads it on retry', async () => {
    setup();
    let failing = true;
    server.use(
      http.get(api('/courses/os/items'), ({ request }) => {
        const offset = Number(
          new URL(request.url).searchParams.get('offset') ?? 0,
        );
        return offset > 0 && failing
          ? HttpResponse.json({ statusCode: 500 }, { status: 500 })
          : HttpResponse.json(posts.slice(offset, offset + 50));
      }),
    );
    renderApp('/courses/os');
    expect(await screen.findByText('Post 50')).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Show more posts' }),
    );

    expect(
      await screen.findByText("Couldn't load this", {}, { timeout: 8000 }),
    ).toBeVisible();
    expect(screen.getByText('Post 50')).toBeVisible();
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Post 51')).toBeVisible();
  }, 20000);

  it('says a locked post and a file without content are not available yet', async () => {
    setup([post(1, null)], [file(1, false), file(2)]);
    renderApp('/courses/os');

    expect(
      await screen.findByText(/Announcement.*Not available yet/),
    ).toBeVisible();
    expect(
      await screen.findByText(/lectures · 1.4 MB · Not available yet/),
    ).toBeVisible();
    expect(screen.getAllByRole('link', { name: /Download/ })).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('fetches on until the post a search result links to is there, and scrolls to it', async () => {
    setup();
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    renderApp('/courses/os#item-i51');

    await waitFor(() => expect(offsets).toEqual([0, 50]));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect(scroll.mock.contexts.at(-1)).toHaveProperty('id', 'item-i51');
    scroll.mockRestore();
  });

  it('shows where the course comes from: each source, how she reads it, and a link to it', async () => {
    setup();
    server.use(
      http.get(api('/courses'), () =>
        HttpResponse.json([
          {
            slug: 'os',
            name: 'Operating systems',
            sources: ['canvas', 'catalog'],
            portalCourses: [
              {
                portal: 'canvas',
                externalId: '297',
                name: 'OS',
                url: 'https://canvas.example.edu/courses/297',
                year: 2026,
                via: 'account',
              },
              {
                portal: 'catalog',
                externalId: 'os',
                name: 'Operativni sistemi',
                url: 'javascript:alert(1)',
                year: null,
                via: 'pick',
              },
            ],
          },
        ]),
      ),
      http.get(api('/me/portals'), () =>
        HttpResponse.json([
          {
            portal: 'canvas',
            label: 'Canvas',
            mode: 'token',
            linked: true,
            status: 'linked',
            expiresAt: null,
            picked: null,
          },
        ]),
      ),
    );
    renderApp('/courses/os');

    const strip = await screen.findByRole('list', { name: 'Sources' });
    const [canvas, picked] = within(strip).getAllByRole('listitem');
    expect(await within(canvas).findByText('Canvas')).toBeVisible();
    expect(
      within(canvas).getByRole('link', { name: 'OS (2026)' }),
    ).toHaveAttribute('href', 'https://canvas.example.edu/courses/297');
    expect(within(canvas).getByText(/through your account/)).toBeVisible();
    // a portal the hub doesn't list to her goes by its id, and an address
    // that isn't a web one is no link
    expect(within(picked).getByText('catalog')).toBeVisible();
    expect(within(picked).queryByRole('link')).toBeNull();
    expect(within(picked).getByText(/picked by you/)).toBeVisible();
  });

  it('names the portal a post opens on by its label', async () => {
    setup([{ ...post(1), url: 'https://canvas.example.edu/courses/1/a/1' }]);
    server.use(
      http.get(api('/me/portals'), () =>
        HttpResponse.json([
          {
            portal: 'canvas',
            label: 'Canvas',
            mode: 'token',
            linked: true,
            instance: null,
            status: 'linked',
            expiresAt: null,
            picked: null,
          },
        ]),
      ),
    );
    renderApp('/courses/os');

    expect(
      await screen.findByRole('link', { name: 'Open Post 1 on Canvas' }),
    ).toHaveTextContent('On Canvas');
  });

  it('says the course is not found when it is not in the list', async () => {
    setup();
    renderApp('/courses/other');

    expect(
      await screen.findByRole('heading', { name: 'Course not found' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Back to My courses' }),
    ).toHaveAttribute('href', '/');
  });
});
