import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from './render';
import { server, signedIn } from './server';

const api = (path: string) => `http://localhost:3000/api${path}`;

const item = (over: object = {}) => ({
  id: 'i1',
  portal: 'canvas',
  kind: 'announcement',
  title: 'Exam dates',
  url: 'https://canvas.example.edu/courses/1/discussion_topics/1',
  publishedAt: '2026-11-01T10:00:00.000Z',
  raw: { message: 'x' },
  ...over,
});

const attachment = (over: object = {}) => ({
  id: 'f1',
  portal: 'canvas',
  itemId: 'i1',
  name: 'rules.pdf',
  path: '',
  url: null,
  size: 52_000,
  mime: 'application/pdf',
  hasContent: true,
  ...over,
});

let textAsked = 0;

const setup = ({
  post = item(),
  text = 'The exam is on Monday.\n\nBring a pen.',
  files = [] as unknown[],
} = {}) => {
  signedIn();
  textAsked = 0;
  server.use(
    http.get(api('/courses'), () =>
      HttpResponse.json([
        {
          slug: 'os',
          name: 'Operating systems',
          sources: ['canvas'],
          portalCourses: [],
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
          instance: null,
          status: 'linked',
          expiresAt: null,
          picked: null,
        },
      ]),
    ),
    http.get(api('/items/i1'), () => HttpResponse.json(post)),
    http.get(api('/items/i1/text'), () => {
      textAsked += 1;
      return HttpResponse.json({ text });
    }),
    http.get(api('/courses/os/files'), ({ request }) =>
      new URL(request.url).searchParams.get('item') === 'i1'
        ? HttpResponse.json(files)
        : HttpResponse.json([]),
    ),
  );
};

describe('a post', () => {
  it('shows its text, date and attachments, and links to the portal in a new tab', async () => {
    setup({
      files: [
        attachment(),
        attachment({
          id: 'f2',
          name: 'x.zip',
          hasContent: false,
          mime: 'application/zip',
        }),
      ],
    });
    renderApp('/courses/os/posts/i1');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Exam dates' }),
    ).toBeVisible();
    expect(await screen.findByText(/The exam is on Monday\./)).toBeVisible();
    expect(screen.getByText(/Bring a pen\./)).toBeVisible();
    expect(screen.getByText(/Nov 1, 2026/)).toBeVisible();

    const list = await screen.findByRole('list', { name: 'Attachments' });
    const [rules, zip] = within(list).getAllByRole('listitem');
    expect(within(rules).getByRole('link')).toHaveAttribute(
      'href',
      '/courses/os/files/f1',
    );
    expect(rules).toHaveTextContent('rules.pdf');
    expect(rules).toHaveTextContent('PDF · 52.0 kB');
    expect(zip).toHaveTextContent('Archive');
    expect(zip).toHaveTextContent('Not available yet');

    const portal = screen.getByRole('link', { name: /Open on Canvas/ });
    expect(portal).toHaveAttribute(
      'href',
      'https://canvas.example.edu/courses/1/discussion_topics/1',
    );
    expect(portal).toHaveAttribute('target', '_blank');
    expect(portal).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('names the course and links back to it', async () => {
    setup();
    renderApp('/courses/os/posts/i1');

    const back = await screen.findByRole('link', {
      name: 'Operating systems',
    });
    expect(back).toHaveAttribute('href', '/courses/os');
    expect(back.parentElement).toHaveTextContent(
      /Operating systems · Announcement · Nov 1, 2026.* · Canvas/,
    );
  });

  it('names the portal it opens on by its label', async () => {
    setup();
    renderApp('/courses/os/posts/i1');

    expect(
      await screen.findByRole('link', { name: 'Open on Canvas' }),
    ).toBeVisible();
  });

  it("says a locked post isn't open yet, and asks for no text", async () => {
    setup({ post: item({ raw: null }) });
    renderApp('/courses/os/posts/i1');

    expect(await screen.findByText('Not open to you yet')).toBeVisible();
    expect(screen.queryByText(/The exam/)).toBeNull();
    expect(textAsked).toBe(0);
  });

  it('says when a post has no text, and links nothing that is not a web address', async () => {
    setup({ text: '  \n ', post: item({ url: 'javascript:alert(1)' }) });
    renderApp('/courses/os/posts/i1');

    expect(await screen.findByText('No text here')).toBeVisible();
    expect(screen.queryByRole('link', { name: /Open on/ })).toBeNull();
  });

  it('names an untitled post by its kind', async () => {
    setup({ post: item({ title: null }) });
    renderApp('/courses/os/posts/i1');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Announcement' }),
    ).toBeVisible();
  });

  it('says a post is not found', async () => {
    setup();
    server.use(
      http.get(api('/items/i1'), () =>
        HttpResponse.json({ statusCode: 404 }, { status: 404 }),
      ),
    );
    renderApp('/courses/os/posts/i1');

    expect(
      await screen.findByRole('heading', { name: 'Post not found' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Back to the course' }),
    ).toHaveAttribute('href', '/courses/os');
  });

  it('shows text as text, never as HTML', async () => {
    setup({ text: '<b>x</b> and <script>alert(1)</script>' });
    renderApp('/courses/os/posts/i1');

    expect(
      await screen.findByText('<b>x</b> and <script>alert(1)</script>'),
    ).toBeVisible();
    expect(document.querySelector('b')).toBeNull();
    expect(document.querySelector('script:not([src])')).toBeNull();
  });
});
