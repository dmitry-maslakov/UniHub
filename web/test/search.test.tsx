import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from './render';
import { server, signedIn } from './server';

const course = (slug: string, name: string) => ({
  slug,
  name,
  sources: [],
  portalCourses: [],
});

const search = (
  handler: Parameters<typeof http.get>[1],
  courses = [course('os', 'Operating systems')],
) =>
  server.use(
    http.get('http://localhost:3000/api/search', handler),
    http.get('http://localhost:3000/api/courses', () =>
      HttpResponse.json(courses),
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
    expect(await screen.findByText('In Operating systems')).toBeVisible();
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

describe('search by type', () => {
  it('leads back from a file to the same search', async () => {
    signedIn();
    search(() => HttpResponse.json({ results: [fileHit()] }));
    renderApp('/search?q=stack&course=os&type=files&from=stack%20OS');

    const link = await screen.findByRole('link', { name: /l5\.pdf/ });
    expect(link).toHaveAttribute(
      'href',
      '/courses/os/files/f1?page=3&processor=office-text&q=stack&course=os&type=files&from=stack+OS',
    );
  });

  it('limits the search to files or posts, kept in the address', async () => {
    signedIn();
    const types: (string | null)[] = [];
    search(({ request }) => {
      types.push(new URL(request.url).searchParams.get('type'));
      return HttpResponse.json({ results: [fileHit()] });
    });
    const { router } = renderApp('/search?q=stack&course=os');

    await screen.findByRole('list', { name: 'Results' });
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: 'Posts' }));

    await waitFor(() => expect(types).toEqual([null, 'posts']));
    expect(router.state.location.search).toEqual({
      q: 'stack',
      course: 'os',
      type: 'posts',
    });

    // the kind is kept when the words change, and when the course is dropped
    const field = screen.getByLabelText('Search your courses');
    await userEvent.clear(field);
    await userEvent.type(field, 'heap');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        q: 'heap',
        course: 'os',
        type: 'posts',
      }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Search all courses' }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        q: 'heap',
        type: 'posts',
      }),
    );

    await userEvent.click(screen.getByRole('radio', { name: 'All' }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ q: 'heap' }),
    );
  });
});

describe("search by a course's initials", () => {
  const courses = [
    course('asp', 'Algoritmi i strukture podataka'),
    course('ar', 'Arhitektura računara'),
    course('aa', 'Analiza i algebra'),
    course('ag', 'Algebra i analiza'),
  ];
  const searchFor = async (words: string) => {
    signedIn();
    const asked: URLSearchParams[] = [];
    search(({ request }) => {
      asked.push(new URL(request.url).searchParams);
      return HttpResponse.json({ results: [] });
    }, courses);
    const view = renderApp('/search');
    await userEvent.type(
      await screen.findByLabelText('Search your courses'),
      words,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    return { ...view, asked };
  };

  it('scopes the search to the course, and puts the word back when the scope is removed', async () => {
    const { router, asked } = await searchFor('stek ASP');

    expect(
      await screen.findByText('In Algoritmi i strukture podataka'),
    ).toBeVisible();
    expect(router.state.location.search).toEqual({
      q: 'stek',
      course: 'asp',
      from: 'stek ASP',
    });
    await waitFor(() => expect(asked.at(-1)?.get('course')).toBe('asp'));
    expect(asked.at(-1)?.get('q')).toBe('stek');

    await userEvent.click(
      screen.getByRole('button', { name: 'Search all courses' }),
    );

    await waitFor(() =>
      expect(router.state.location.search).toEqual({ q: 'stek ASP' }),
    );
    await waitFor(() => expect(asked.at(-1)?.get('q')).toBe('stek ASP'));
    expect(asked.at(-1)?.get('course')).toBeNull();
    expect(screen.queryByText(/^In /)).toBeNull();
  });

  it('leaves a word alone', async () => {
    const { router } = await searchFor('ASP');

    await waitFor(() =>
      expect(router.state.location.search).toEqual({ q: 'ASP' }),
    );
  });

  it('scopes nothing by initials two courses share', async () => {
    const { router } = await searchFor('stek AA');

    await waitFor(() =>
      expect(router.state.location.search).toEqual({ q: 'stek AA' }),
    );
  });

  it('shows the words without the initials once they scope the search, and a second search leaves the address alone', async () => {
    signedIn();
    search(() => HttpResponse.json({ results: [] }), courses);
    const { router } = renderApp('/search?q=stek');

    const field = await screen.findByLabelText('Search your courses');
    await userEvent.type(field, ' ASP');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    const scoped = {
      q: 'stek',
      course: 'asp',
      from: 'stek ASP',
    };
    await waitFor(() => expect(router.state.location.search).toEqual(scoped));
    await waitFor(() =>
      expect(screen.getByLabelText('Search your courses')).toHaveValue('stek'),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(router.state.location.search).toEqual(scoped));
    expect(screen.getByLabelText('Search your courses')).toHaveValue('stek');
  });

  it('leaves a link that names a course alone', async () => {
    signedIn();
    search(() => HttpResponse.json({ results: [] }), courses);
    const { router } = renderApp('/search?q=stek%20AR&course=asp');

    const field = await screen.findByLabelText('Search your courses');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(field).toHaveValue('stek AR');
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        q: 'stek AR',
        course: 'asp',
      }),
    );
  });
});

describe('an empty search', () => {
  it('says to try other words, or fewer', async () => {
    signedIn();
    search(() => HttpResponse.json({ results: [] }));

    renderApp('/search?q=stack');
    expect(await screen.findByText('Try other words, or fewer.')).toBeVisible();
  });

  it('says to search everything once a filter is on', async () => {
    signedIn();
    search(() => HttpResponse.json({ results: [] }));

    renderApp('/search?q=stack&type=files');
    expect(
      await screen.findByText('Try other words, or search everything.'),
    ).toBeVisible();
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
