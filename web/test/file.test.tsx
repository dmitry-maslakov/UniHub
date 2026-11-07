import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from './render';
import { server, signedIn } from './server';

const api = (path: string) => `http://localhost:3000/api${path}`;

const details = (over: object = {}) => ({
  id: 'f1',
  portal: 'canvas',
  itemId: null,
  name: 'Lecture 5.pdf',
  path: 'Predavanja',
  url: null,
  size: 1_400_000,
  mime: 'application/pdf',
  hasContent: true,
  texts: [{ processor: 'office-text', version: 1, pages: 12 }],
  ...over,
});

const member = (over: object = {}) => ({
  path: 'lab/main.c',
  size: 900,
  mime: 'text/x-c',
  leftOut: null,
  texts: [{ processor: 'plain-text', version: 1, pages: 1 }],
  ...over,
});

const asked: URLSearchParams[] = [];

const setup = ({
  file = details(),
  members = [] as unknown[],
  text = (query: URLSearchParams) =>
    HttpResponse.json({
      processor: query.get('processor') ?? 'office-text',
      version: 1,
      pages: 12,
      page: Number(query.get('page') ?? 1),
      text: `text of part ${query.get('page') ?? 1}`,
    }),
} = {}) => {
  signedIn();
  asked.length = 0;
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
    http.get(api('/files/f1'), () => HttpResponse.json(file)),
    http.get(api('/files/f1/members'), ({ request }) => {
      const offset = Number(
        new URL(request.url).searchParams.get('offset') ?? 0,
      );
      return HttpResponse.json(members.slice(offset, offset + 50));
    }),
    http.get(api('/files/f1/text'), ({ request }) => {
      const query = new URL(request.url).searchParams;
      asked.push(query);
      return text(query);
    }),
  );
};

describe('a file', () => {
  it('reads the part a search found', async () => {
    setup({
      file: details({
        texts: [
          { processor: 'ocr', version: 1, pages: 12 },
          { processor: 'office-text', version: 1, pages: 12 },
        ],
      }),
    });
    renderApp('/courses/os/files/f1?page=3&processor=office-text');

    expect(await screen.findByText('Page 3 of 12')).toBeVisible();
    expect(screen.getByText('text of part 3')).toBeVisible();
    expect(asked.at(-1)?.get('page')).toBe('3');
    expect(asked.at(-1)?.get('processor')).toBe('office-text');
    // the text asked for is the one chosen
    expect(
      screen.getByRole('radio', { name: 'office-text', checked: true }),
    ).toBeVisible();
  });

  it('shows what the file is: its course, folder, size and type', async () => {
    setup();
    renderApp('/courses/os/files/f1');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lecture 5.pdf' }),
    ).toBeVisible();
    const course = await screen.findByRole('link', {
      name: 'Operating systems',
    });
    expect(course).toHaveAttribute('href', '/courses/os');
    expect(course.parentElement).toHaveTextContent(
      'Operating systems · Predavanja · 1.4 MB · PDF',
    );
  });

  it('steps through parts, and keeps the part in the address', async () => {
    setup();
    const { router } = renderApp('/courses/os/files/f1');

    expect(await screen.findByText('Page 1 of 12')).toBeVisible();
    expect(asked.at(-1)?.get('processor')).toBe('office-text');
    await userEvent.click(screen.getByRole('button', { name: 'Next part' }));

    expect(await screen.findByText('Page 2 of 12')).toBeVisible();
    expect(router.state.location.search).toEqual({ page: '2' });
    await userEvent.click(screen.getByRole('button', { name: 'Part 5' }));
    expect(await screen.findByText('Page 5 of 12')).toBeVisible();

    router.history.back();
    expect(await screen.findByText('Page 2 of 12')).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Previous part' }),
    );
    expect(await screen.findByText('Page 1 of 12')).toBeVisible();
  });

  it('shows another text when there are several, from its first part', async () => {
    setup({
      file: details({
        texts: [
          { processor: 'office-text', version: 1, pages: 12 },
          { processor: 'ocr', version: 1, pages: 12 },
        ],
      }),
    });
    const { router } = renderApp('/courses/os/files/f1?page=4');

    expect(await screen.findByText('Page 4 of 12')).toBeVisible();
    await userEvent.click(screen.getByRole('radio', { name: 'ocr' }));

    await waitFor(() =>
      expect(router.state.location.search).toEqual({ processor: 'ocr' }),
    );
    expect(await screen.findByText('Page 1 of 12')).toBeVisible();
    expect(asked.at(-1)?.get('processor')).toBe('ocr');
  });

  it("calls a deck's parts slides", async () => {
    setup({
      file: details({
        name: 'deck.pptx',
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }),
    });
    renderApp('/courses/os/files/f1?page=2');

    expect(await screen.findByText('Slide 2 of 12')).toBeVisible();
  });

  it('calls the parts of anything else parts', async () => {
    setup({ file: details({ name: 'notes.docx', mime: null }) });
    renderApp('/courses/os/files/f1');

    expect(await screen.findByText('Part 1 of 12')).toBeVisible();
  });

  it('opens a PDF in a new tab and downloads other types', async () => {
    setup();
    renderApp('/courses/os/files/f1');

    const open = await screen.findByRole('link', { name: 'Open the original' });
    expect(open).toHaveAttribute(
      'href',
      '/api/files/f1/content?disposition=inline',
    );
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('link', { name: 'Download' })).toBeNull();
  });

  it.each([
    [
      'notes.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    // a page the browser would run
    ['page.html', 'text/html'],
    ['picture.svg', 'image/svg+xml'],
  ])('downloads %s, never opens it', async (name, mime) => {
    setup({ file: details({ name, mime }) });
    renderApp('/courses/os/files/f1');

    const download = await screen.findByRole('link', { name: 'Download' });
    expect(download).toHaveAttribute('href', '/api/files/f1/content');
    expect(download).not.toHaveAttribute('target');
    expect(
      screen.queryByRole('link', { name: 'Open the original' }),
    ).toBeNull();
  });

  it("lists an archive's members and reads one", async () => {
    setup({
      file: details({
        name: 'lab.zip',
        mime: 'application/zip',
        texts: [],
      }),
      members: [
        member(),
        member({ path: 'lab/data.bin', texts: [], mime: null }),
        member({
          path: 'lab/huge.iso',
          texts: [],
          leftOut: 'TOO_LARGE',
          size: 9e9,
        }),
      ],
      text: (query) =>
        HttpResponse.json({
          processor: query.get('processor') ?? 'plain-text',
          version: 1,
          pages: 1,
          page: 1,
          text: query.get('member') ? 'int main() {}' : 'whole',
        }),
    });
    const { router } = renderApp('/courses/os/files/f1');

    const list = await screen.findByRole('list', {
      name: 'Files in the archive',
    });
    const [text, bin, huge] = within(list).getAllByRole('listitem');
    expect(within(text).getByRole('link')).toHaveAttribute(
      'href',
      '/courses/os/files/f1?member=lab%2Fmain.c',
    );
    // no text of its own: the archive's own page says so, with a download
    expect(screen.getByText('No text in this file')).toBeVisible();
    expect(within(bin).getByText(/No text/)).toBeVisible();
    expect(within(bin).getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      '/api/files/f1/content?member=lab%2Fdata.bin',
    );
    expect(huge).toHaveTextContent('Left out: too large');
    expect(within(huge).queryByRole('link')).toBeNull();

    await userEvent.click(within(text).getByRole('link'));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'main.c' }),
    ).toBeVisible();
    expect(await screen.findByText('int main() {}')).toBeVisible();
    expect(asked.at(-1)?.get('member')).toBe('lab/main.c');
    expect(router.state.location.search).toEqual({ member: 'lab/main.c' });
    // its archive, and a download that is always a download
    expect(screen.getByText(/In lab\.zip/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      '/api/files/f1/content?member=lab%2Fmain.c',
    );
    expect(
      screen.queryByRole('list', { name: 'Files in the archive' }),
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Back to lab.zip' }),
    ).toHaveAttribute('href', '/courses/os/files/f1');
  });

  it('pages through the members of a big archive', async () => {
    const many = Array.from({ length: 51 }, (_, i) =>
      member({ path: `src/f${i}.c` }),
    );
    setup({ file: details({ texts: [] }), members: many });
    renderApp('/courses/os/files/f1');

    expect(await screen.findByText('src/f49.c')).toBeVisible();
    expect(screen.queryByText('src/f50.c')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(await screen.findByText('src/f50.c')).toBeVisible();
  });

  it('says why a member was left out', async () => {
    setup({
      file: details({ texts: [] }),
      members: [
        member({ path: 'a', texts: [], leftOut: 'OVER_BUDGET' }),
        member({ path: 'b', texts: [], leftOut: 'DUPLICATE_PATH' }),
        member({ path: 'c', texts: [], leftOut: 'TOO_DEEP' }),
      ],
    });
    renderApp('/courses/os/files/f1');

    expect(
      await screen.findByText(/Left out: the archive holds too much/),
    ).toBeVisible();
    expect(screen.getByText(/another file has the same path/)).toBeVisible();
    expect(screen.getByText(/nested too deep/)).toBeVisible();
  });

  it('says when a file has no text, or no content yet', async () => {
    setup({ file: details({ texts: [] }) });
    renderApp('/courses/os/files/f1');
    expect(await screen.findByText('No text in this file')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Open the original' }),
    ).toBeVisible();
  });

  it('says a file without content is not available yet, and asks for no text', async () => {
    setup({ file: details({ hasContent: false, texts: [] }) });
    renderApp('/courses/os/files/f1');

    expect(await screen.findByText('Not available yet')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Open the original' }),
    ).toBeNull();
    expect(asked).toEqual([]);
  });

  it('says a part that is not there, and leads to the first', async () => {
    setup({
      text: () => HttpResponse.json({ statusCode: 404 }, { status: 404 }),
    });
    const { router } = renderApp('/courses/os/files/f1?page=99');

    expect(await screen.findByText("This part isn't there")).toBeVisible();
    await userEvent.click(
      screen.getByRole('link', { name: 'Go to its first part.' }),
    );
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  it('says when a part has no text', async () => {
    setup({
      text: () =>
        HttpResponse.json({
          processor: 'office-text',
          version: 1,
          pages: 2,
          page: 1,
          text: ' \n',
        }),
    });
    renderApp('/courses/os/files/f1');

    expect(await screen.findByText('No text on this part')).toBeVisible();
    expect(screen.getByText('Page 1 of 2')).toBeVisible();
  });

  it('says a file is not found', async () => {
    setup();
    server.use(
      http.get(api('/files/f1'), () =>
        HttpResponse.json({ statusCode: 404 }, { status: 404 }),
      ),
    );
    renderApp('/courses/os/files/f1');

    expect(
      await screen.findByRole('heading', { name: 'File not found' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Back to the course' }),
    ).toHaveAttribute('href', '/courses/os');
  });

  it('goes back to the search results', async () => {
    setup();
    renderApp('/courses/os/files/f1?q=stack&course=os');

    const back = await screen.findByRole('link', {
      name: 'Back to search results',
    });
    expect(back).toHaveAttribute('href', '/search?q=stack&course=os');
  });

  it('shows text as text, never as HTML', async () => {
    setup({
      text: () =>
        HttpResponse.json({
          processor: 'office-text',
          version: 1,
          pages: 1,
          page: 1,
          text: '<img src=x onerror=alert(1)>',
        }),
    });
    renderApp('/courses/os/files/f1');

    expect(
      await screen.findByText('<img src=x onerror=alert(1)>'),
    ).toBeVisible();
    expect(document.querySelector('img')).toBeNull();
  });
});
