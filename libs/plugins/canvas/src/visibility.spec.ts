import { forEveryone, raw } from './visibility.js';

describe('only what the whole course sees', () => {
  it('leaves out announcements for some sections', () => {
    const topic = { id: 1, title: 't', html_url: '', posted_at: null };
    expect(forEveryone.announcement(topic)).toBe(true);
    expect(
      forEveryone.announcement({ ...topic, is_section_specific: true }),
    ).toBe(false);
  });

  it('leaves out assignments only some students have', () => {
    const assignment = { id: 1, name: 'a', html_url: '' };
    expect(forEveryone.assignment(assignment)).toBe(true);
    expect(
      forEveryone.assignment({
        ...assignment,
        only_visible_to_overrides: false,
        visible_to_everyone: true,
      }),
    ).toBe(true);
    expect(
      forEveryone.assignment({
        ...assignment,
        only_visible_to_overrides: true,
      }),
    ).toBe(false);
    expect(
      forEveryone.assignment({ ...assignment, visible_to_everyone: false }),
    ).toBe(false);
  });

  it("keeps the user's own state out of raw, at any depth", () => {
    const topic = {
      id: 1,
      title: 'Welcome',
      message: '<p>hi</p>',
      read_state: 'unread',
      unread_count: 3,
      subscribed: true,
      permissions: { reply: true },
      locked_for_user: false,
      lock_explanation: 'locked until Monday',
      attachments: [{ id: 2, display_name: 'a.pdf', locked_for_user: true }],
    };
    expect(raw(topic)).toEqual({
      id: 1,
      title: 'Welcome',
      message: '<p>hi</p>',
      attachments: [{ id: 2, display_name: 'a.pdf' }],
    });
  });

  it('keeps out how far the user got through a module', () => {
    const module = {
      id: 5,
      name: 'Week 1',
      position: 1,
      state: 'completed',
      completed_at: '2026-10-03T10:00:00Z',
      items: [
        {
          id: 9,
          type: 'Page',
          completion_requirement: { type: 'must_view', completed: true },
          content_details: { due_at: null, locked_for_user: false },
        },
      ],
    };
    expect(raw(module)).toEqual({
      id: 5,
      name: 'Week 1',
      position: 1,
      items: [
        {
          id: 9,
          type: 'Page',
          completion_requirement: { type: 'must_view' },
          content_details: { due_at: null },
        },
      ],
    });
  });

  it('keeps out download links, which carry the key to a file', () => {
    const attachment = {
      id: 2,
      url: 'https://canvas.example.edu/files/2/download?download_frd=1&verifier=k',
      thumbnail_url:
        'https://canvas.example.edu/images/thumbnails/2/k?verifier=k',
      html_url: 'https://canvas.example.edu/courses/1/files/2',
      body: '<a href="/files/2?verifier=k">notes</a>',
    };
    expect(raw(attachment)).toEqual({
      id: 2,
      html_url: 'https://canvas.example.edu/courses/1/files/2',
      body: '<a href="/files/2?verifier=k">notes</a>',
    });
  });
});
