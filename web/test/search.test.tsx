import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from './render';
import { server, signedIn } from './server';

const search = (handler: Parameters<typeof http.get>[1]) =>
  server.use(http.get('http://localhost:3000/api/search', handler));

describe('search', () => {
  it('reads the words from the address, and links a hit to its course', async () => {
    signedIn();
    let asked = '';
    search(({ request }) => {
      asked = new URL(request.url).searchParams.get('q') ?? '';
      return HttpResponse.json({
        results: [
          {
            type: 'file',
            fileId: 'f1',
            name: 'l5.pdf',
            path: 'lectures',
            member: null,
            course: 'os',
            pages: [
              {
                page: 3,
                processor: 'pdf',
                snippet: { text: 'the stack grows', highlights: [[4, 9]] },
              },
            ],
            matchedName: null,
            sameContentIn: [],
          },
        ],
      });
    });
    renderApp('/search?q=stack');

    const list = await screen.findByRole('list', { name: 'Results' });
    expect(asked).toBe('stack');
    expect(within(list).getByText('stack').tagName).toBe('MARK');
    expect(
      within(list).getByRole('link', { name: 'In the course' }),
    ).toHaveAttribute('href', '/courses/os#file-f1');
    expect(
      within(list).getByRole('link', { name: 'Download' }),
    ).toHaveAttribute('href', '/api/files/f1/content');
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

    expect(
      await screen.findByText(/Nothing in your courses matches/),
    ).toBeVisible();
    expect(router.state.location.search).toEqual({ q: 'heap' });
  });

  it('says to slow down when the limit is hit', async () => {
    signedIn();
    search(() => HttpResponse.json({ statusCode: 429 }, { status: 429 }));
    renderApp('/search?q=stack');

    expect(await screen.findByRole('alert')).toHaveTextContent(/Slow down/);
  });
});
