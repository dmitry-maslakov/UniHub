import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { leaveTo } from '@/shared/lib';
import { renderApp } from './render';
import { server, signedIn } from './server';

// the page stays; the browser is sent to the zip
vi.mock('@/shared/lib/leave', () => ({ leaveTo: vi.fn() }));

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
  changedAt: '2026-11-03T12:00:00.000Z',
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
const memberOffsets: number[] = [];

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
  memberOffsets.length = 0;
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
      const query = new URL(request.url).searchParams;
      const offset = Number(query.get('offset') ?? 0);
      memberOffsets.push(offset);
      return HttpResponse.json(
        members.slice(offset, offset + Number(query.get('limit') ?? 50)),
      );
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

  it('shows what the file is: its course, folder, size, date and type', async () => {
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
      'Operating systems · Predavanja · 1.4 MB · Nov 3, 2026 · PDF',
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

    const tree = await screen.findByRole('navigation', {
      name: 'Files in the archive',
    });
    // the folder they sit in, open, and the file with a text a link
    expect(within(tree).getByText('lab')).toBeVisible();
    const text = within(tree).getByRole('link', { name: /main\.c/ });
    expect(text).toHaveAttribute(
      'href',
      '/courses/os/files/f1?member=lab%2Fmain.c',
    );
    expect(text).toHaveTextContent('900 B');
    // no text of its own, but what is inside is shown, not "no text"
    expect(screen.queryByText('No text in this file')).toBeNull();
    const bin =
      within(tree).getByText('data.bin').parentElement!.parentElement!;
    expect(bin).toHaveTextContent('No text');
    expect(within(bin).getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      '/api/files/f1/content?member=lab%2Fdata.bin',
    );
    // left out: its reason, no link and no box
    const huge =
      within(tree).getByText('huge.iso').parentElement!.parentElement!;
    expect(huge).toHaveTextContent('Left out: too large');
    expect(within(huge).queryByRole('link')).toBeNull();
    expect(
      screen.queryByRole('checkbox', { name: 'Select huge.iso' }),
    ).toBeNull();
    expect(
      screen.getByRole('checkbox', { name: 'Select data.bin' }),
    ).toBeVisible();

    await userEvent.click(text);

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
      screen.queryByRole('navigation', { name: 'Files in the archive' }),
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Back to lab.zip' }),
    ).toHaveAttribute('href', '/courses/os/files/f1');
  });

  it("an archive's page shows what's inside, not 'no text'", async () => {
    setup({
      file: details({ name: 'lab.zip', mime: 'application/zip', texts: [] }),
      members: [member()],
    });
    renderApp('/courses/os/files/f1');

    expect(
      await screen.findByRole('navigation', { name: 'Files in the archive' }),
    ).toBeVisible();
    expect(screen.queryByText('No text in this file')).toBeNull();
  });

  it('says an archive with nothing inside has no text', async () => {
    setup({
      file: details({ name: 'lab.zip', mime: 'application/zip', texts: [] }),
    });
    renderApp('/courses/os/files/f1');

    expect(await screen.findByText('No text in this file')).toBeVisible();
  });

  it('reads every page of members, 200 at a time', async () => {
    const many = Array.from({ length: 450 }, (_, i) =>
      member({ path: `f${i}.c` }),
    );
    setup({
      file: details({ mime: 'application/zip', texts: [] }),
      members: many,
    });
    renderApp('/courses/os/files/f1');

    expect(await screen.findByText('f449.c')).toBeVisible();
    expect(memberOffsets).toEqual([0, 200, 400]);
    expect(screen.queryByText(/Showing the first/)).toBeNull();
  });

  it('stops at 2,000 members, and says so', async () => {
    const many = Array.from({ length: 2100 }, (_, i) =>
      member({ path: `f${i}.c` }),
    );
    setup({
      file: details({ mime: 'application/zip', texts: [] }),
      members: many,
    });
    renderApp('/courses/os/files/f1');

    // two thousand rows take a while to draw
    expect(
      await screen.findByText(
        /Showing the first 2,000/,
        {},
        { timeout: 10_000 },
      ),
    ).toBeVisible();
    expect(memberOffsets).toHaveLength(10);
  }, 20_000);

  it('says while the members load, and when they fail', async () => {
    setup({
      file: details({ name: 'lab.zip', mime: 'application/zip', texts: [] }),
    });
    server.use(
      http.get(api('/files/f1/members'), () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );
    renderApp('/courses/os/files/f1');

    expect(
      await screen.findByText('Loading the files in the archive'),
    ).toBeInTheDocument();
    // after the retries
    expect(
      await screen.findByText("Couldn't load this", {}, { timeout: 8000 }),
    ).toBeVisible();
  }, 20_000);

  it('asks for no members of a file that is no archive', async () => {
    setup({ file: details() });
    renderApp('/courses/os/files/f1');

    await screen.findByText(/text of part 1/);
    expect(memberOffsets).toEqual([]);
  });

  it('downloads two members of an archive', async () => {
    const asked: unknown[] = [];
    setup({
      file: details({ name: 'lab.zip', mime: 'application/zip', texts: [] }),
      members: [
        member(),
        member({ path: 'lab/data.bin', texts: [], mime: null, size: 100 }),
        member({ path: 'README.md', size: 50 }),
        member({ path: 'lab/huge.iso', texts: [], leftOut: 'TOO_LARGE' }),
      ],
    });
    server.use(
      http.post(api('/downloads'), async ({ request }) => {
        asked.push(await request.json());
        return HttpResponse.json(
          { url: '/api/downloads/xyz', name: 'lab.zip', count: 2, size: 1000 },
          { status: 201 },
        );
      }),
    );
    renderApp('/courses/os/files/f1');

    const folder = await screen.findByRole('checkbox', {
      name: 'Select everything in lab',
    });
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select main.c' }),
    );
    expect(folder).toBePartiallyChecked();
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select data.bin' }),
    );
    // the folder's box is checked when all it can tick is
    expect(folder).toBeChecked();
    expect(screen.getByText('2 selected, 1.0 kB')).toBeVisible();

    await userEvent.click(
      screen.getByRole('button', { name: 'Download as ZIP' }),
    );

    await waitFor(() =>
      expect(leaveTo).toHaveBeenCalledWith('/api/downloads/xyz'),
    );
    expect(asked).toEqual([
      {
        items: [
          { file: 'f1', member: 'lab/main.c' },
          { file: 'f1', member: 'lab/data.bin' },
        ],
      },
    ]);
  });

  it('says why a member was left out', async () => {
    setup({
      file: details({ mime: 'application/zip', texts: [] }),
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

  it("shows an image as the hub's picture of it, with no empty state", async () => {
    setup({
      file: details({ name: 'plot.png', mime: 'image/png', texts: [] }),
    });
    renderApp('/courses/os/files/f1');

    const image = await screen.findByRole('img', { name: 'plot.png' });
    expect(image).toHaveAttribute('src', '/api/files/f1/view');
    expect(screen.queryByText('No text in this file')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Page' })).toBeNull();
    expect(asked).toEqual([]);
  });

  it('shows a picture inside an archive by its member, and never an SVG', async () => {
    setup({
      file: details({ name: 'figs.zip', mime: 'application/zip', texts: [] }),
      members: [member({ path: 'fig/a b.png', mime: 'image/png', texts: [] })],
    });
    renderApp('/courses/os/files/f1?member=fig%2Fa%20b.png');
    expect(await screen.findByRole('img', { name: 'a b.png' })).toHaveAttribute(
      'src',
      '/api/files/f1/view?member=fig%2Fa%20b.png',
    );
  });

  it('shows no empty state under the picture of an image inside an archive', async () => {
    setup({
      file: details({ name: 'figs.zip', mime: 'application/zip', texts: [] }),
      members: [member({ path: 'fig/a.png', mime: 'image/png', texts: [] })],
      text: () => HttpResponse.json({ code: 'NOT_READABLE' }, { status: 404 }),
    });
    renderApp('/courses/os/files/f1?member=fig%2Fa.png');
    await screen.findByRole('img', { name: 'a.png' });
    expect(screen.queryByText(/This part isn't there/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Text' })).toBeNull();
    expect(asked).toEqual([]);
  });

  it('says a picture failed, and tries it again', async () => {
    setup({
      file: details({ name: 'plot.png', mime: 'image/png', texts: [] }),
    });
    renderApp('/courses/os/files/f1');
    const image = await screen.findByRole('img', { name: 'plot.png' });
    fireEvent.error(image);
    expect(await screen.findByRole('alert')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      screen.getByRole('status', { name: 'Loading the picture' }),
    ).toBeVisible();
    expect(await screen.findByRole('img', { name: 'plot.png' })).toBeVisible();
  });

  it('draws the first page of a PDF that has no text', async () => {
    setup({ file: details({ texts: [] }) });
    renderApp('/courses/os/files/f1');
    expect(await screen.findByText('No text in this file')).toBeVisible();
    expect(
      screen.getByRole('img', { name: 'Lecture 5.pdf, Page 1' }),
    ).toHaveAttribute('src', '/api/files/f1/view?page=1');
  });

  it('shows no picture of an SVG', async () => {
    setup({
      file: details({
        name: 'logo.svg',
        mime: 'image/svg+xml',
        texts: [],
      }),
    });
    renderApp('/courses/os/files/f1');
    expect(await screen.findByRole('heading', { level: 1 })).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it("switches a PDF between its text and its pages' pictures, kept in the address", async () => {
    setup();
    const { router } = renderApp('/courses/os/files/f1?page=2');

    expect(await screen.findByText('text of part 2')).toBeVisible();
    expect(
      screen.getByRole('radio', { name: 'Text', checked: true }),
    ).toBeVisible();
    expect(screen.queryByRole('img', { name: /Lecture 5/ })).toBeNull();

    await userEvent.click(screen.getByRole('radio', { name: 'Page' }));
    const image = await screen.findByRole('img', {
      name: 'Lecture 5.pdf, Page 2',
    });
    expect(image).toHaveAttribute('src', '/api/files/f1/view?page=2');
    expect(router.state.location.search).toEqual({ page: '2', show: 'page' });
    expect(screen.queryByText('text of part 2')).toBeNull();

    // the same paging control turns the page
    await userEvent.click(screen.getByRole('button', { name: 'Next part' }));
    expect(
      await screen.findByRole('img', { name: 'Lecture 5.pdf, Page 3' }),
    ).toHaveAttribute('src', '/api/files/f1/view?page=3');

    await userEvent.click(screen.getByRole('radio', { name: 'Text' }));
    expect(await screen.findByText('text of part 3')).toBeVisible();
    expect(router.state.location.search).toEqual({ page: '3' });
  });

  it('opens a PDF on its pages when the address says so, and not any other type', async () => {
    setup();
    renderApp('/courses/os/files/f1?show=page');
    expect(
      await screen.findByRole('img', { name: 'Lecture 5.pdf, Page 1' }),
    ).toBeVisible();
  });

  it('offers no pages for a file that is not a PDF', async () => {
    setup({
      file: details({
        name: 'notes.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    });
    renderApp('/courses/os/files/f1?show=page');
    expect(await screen.findByText('text of part 1')).toBeVisible();
    expect(screen.queryByRole('radio', { name: 'Page' })).toBeNull();
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

  it('goes back to the search it was opened from, kind and typed words too', async () => {
    setup();
    renderApp(
      '/courses/os/files/f1?q=stack&course=os&type=files&from=stack%20OS',
    );

    const back = await screen.findByRole('link', {
      name: 'Back to search results',
    });
    expect(back).toHaveAttribute(
      'href',
      '/search?q=stack&course=os&type=files&from=stack+OS',
    );
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
