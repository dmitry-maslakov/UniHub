import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from './render';
import { server, signedIn } from './server';

const search = (handler: Parameters<typeof http.get>[1]) =>
  server.use(
    http.get('http://localhost:3000/api/search', handler),
    http.get('http://localhost:3000/api/courses', () =>
      HttpResponse.json([
        {
          slug: 'os',
          name: 'Operating systems',
          sources: [],
          portalCourses: [],
        },
      ]),
    ),
  );

const fileHit = (over: object = {}) => ({
  type: 'file',
  fileId: 'f1',
  name: 'l5.pdf',
  path: 'lectures',
  member: null,
  course: 'os',
  pages: [
    {
      page: 3,
      processor: 'office-text',
      snippet: { text: 'the stack grows', highlights: [[4, 9]] },
    },
  ],
  matchedName: null,
  sameContentIn: [],
  ...over,
});

describe('search', () => {
  it('reads the words from the address, and opens a file at the part that matched', async () => {
    signedIn();
    let asked = '';
    search(({ request }) => {
      asked = new URL(request.url).searchParams.get('q') ?? '';
      return HttpResponse.json({ results: [fileHit()] });
    });
    renderApp('/search?q=stack');

    const list = await screen.findByRole('list', { name: 'Results' });
    expect(asked).toBe('stack');
    expect(within(list).getByText('stack').tagName).toBe('MARK');
    // the whole row is the link: to the part, with the search to go back to
    expect(within(list).getByRole('link')).toHaveAttribute(
      'href',
      '/courses/os/files/f1?page=3&processor=office-text&q=stack',
    );
    // no download or course link of its own on a hit; the course by its
    // name, not its slug
    expect(within(list).getAllByRole('link')).toHaveLength(1);
    expect(
      await within(list).findByText('Operating systems · lectures · Page 3'),
    ).toBeVisible();
  });

  it('opens a member inside its archive', async () => {
    signedIn();
    search(() =>
      HttpResponse.json({
        results: [
          fileHit({
            type: 'member',
            name: 'lab.zip',
            path: '',
            member: 'lab/main.c',
            pages: [
              {
                page: 1,
                processor: 'plain-text',
                snippet: { text: 'int main', highlights: [] },
              },
            ],
          }),
        ],
      }),
    );
    renderApp('/search?q=main');

    const link = await screen.findByRole('link', { name: /main\.c/ });
    expect(link).toHaveAttribute(
      'href',
      '/courses/os/files/f1?page=1&processor=plain-text&member=lab%2Fmain.c&q=main',
    );
    expect(link).toHaveTextContent('lab/main.c');
    expect(link).toHaveTextContent('In lab.zip');
    expect(link).toHaveTextContent('Part 1');
  });

  it('says a name matched when no text did', async () => {
    signedIn();
    search(() =>
      HttpResponse.json({
        results: [
          fileHit({
            pages: [],
            matchedName: { text: 'l5.pdf', highlights: [[0, 2]] },
          }),
        ],
      }),
    );
    renderApp('/search?q=l5');

    const link = await screen.findByRole('link', { name: /l5\.pdf/ });
    expect(link).toHaveAttribute('href', '/courses/os/files/f1?q=l5');
    expect(link).toHaveTextContent('Name matches');
  });

  it('opens a post on its own page', async () => {
    signedIn();
    search(() =>
      HttpResponse.json({
        results: [
          {
            type: 'post',
            itemId: 'i9',
            kind: 'announcement',
            title: 'Exam dates',
            url: null,
            publishedAt: '2026-11-01T10:00:00.000Z',
            course: 'os',
            snippet: { text: 'the exam is on Monday', highlights: [[4, 8]] },
          },
        ],
      }),
    );
    renderApp('/search?q=exam');

    const link = await screen.findByRole('link', { name: /Exam dates/ });
    expect(link).toHaveAttribute('href', '/courses/os/posts/i9');
    expect(
      await within(link).findByText(
        'Announcement · Operating systems · Nov 1, 2026',
      ),
    ).toBeVisible();
    expect(within(link).getByText('exam').tagName).toBe('MARK');
  });

  it('names the course, not its address', async () => {
    signedIn();
    search(() => HttpResponse.json({ results: [fileHit({ course: 'os' })] }));
    renderApp('/search?q=stack');

    expect(await screen.findByText(/Operating systems/)).toBeVisible();
    expect(screen.queryByText(/^os\b/)).toBeNull();
  });

  it('searches one course and widens to all', async () => {
    signedIn();
    const courses: (string | null)[] = [];
    search(({ request }) => {
      courses.push(new URL(request.url).searchParams.get('course'));
      return HttpResponse.json({ results: [fileHit()] });
    });
    const { router } = renderApp('/search?q=stack&course=os');

    const list = await screen.findByRole('list', { name: 'Results' });
    expect(courses).toEqual(['os']);
    expect(screen.getByText('In Operating systems')).toBeVisible();
    // the file's page leads back to the same scoped search
    expect(within(list).getByRole('link')).toHaveAttribute(
      'href',
      '/courses/os/files/f1?page=3&processor=office-text&q=stack&course=os',
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Search all courses' }),
    );

    await waitFor(() => expect(courses).toEqual(['os', null]));
    expect(router.state.location.search).toEqual({ q: 'stack' });
    expect(screen.queryByText('In Operating systems')).toBeNull();
  });

  it('keeps the course when the words change', async () => {
    signedIn();
    search(() => HttpResponse.json({ results: [] }));
    const { router } = renderApp('/search?q=stack&course=os');

    const field = await screen.findByLabelText('Search your courses');
    await userEvent.clear(field);
    await userEvent.type(field, 'heap');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        q: 'heap',
        course: 'os',
      }),
    );
  });

  it('puts what is typed into the address', async () => {
    signedIn();
    search(() => HttpResponse.json({ results: [] }));
    const { router } = renderApp('/search');

    await userEvent.type(
      await screen.findByLabelText('Search your courses'),
      'heap',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText(/Nothing matches/)).toBeVisible();
    expect(router.state.location.search).toEqual({ q: 'heap' });
  });

  it('says to slow down when the limit is hit', async () => {
    signedIn();
    search(() => HttpResponse.json({ statusCode: 429 }, { status: 429 }));
    renderApp('/search?q=stack');

    expect(await screen.findByRole('alert')).toHaveTextContent(/Slow down/);
  });
});

describe('search words', () => {
  it('are trimmed before the search is asked for', async () => {
    signedIn();
    let asked: string | null = null;
    search(({ request }) => {
      asked = new URL(request.url).searchParams.get('q');
      return HttpResponse.json({ results: [] });
    });
    renderApp('/search?q=%20%20stack%20');

    expect(await screen.findByText(/Nothing matches/)).toBeVisible();
    expect(asked).toBe('stack');
  });
});
