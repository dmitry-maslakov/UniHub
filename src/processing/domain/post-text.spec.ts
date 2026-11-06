import {
  MAX_POST_CHARS,
  MAX_POST_HTML,
  postStrings,
  postText,
} from './post-text.js';

describe('postStrings', () => {
  // the hub knows no portal's fields: a page's body, an assignment's
  // description, an attachment's name, a module's items' titles
  it("is the title, then every string in raw, at any depth, in raw's order", () => {
    expect(
      postStrings({
        title: 'Exam',
        raw: {
          message: '<p>on <b>Monday</b></p>',
          points: 10,
          published: true,
          attachments: [{ display_name: 'schedule.pdf', size: 3 }],
          items: [{ title: 'Lecture 1' }, null],
        },
      }),
    ).toEqual(['Exam', '<p>on <b>Monday</b></p>', 'schedule.pdf', 'Lecture 1']);
  });

  it("leaves out links and dates, the portal's own values rather than words", () => {
    expect(
      postStrings({
        title: 'Lab 1',
        raw: {
          html_url: 'https://canvas.example.edu/courses/101/pages/lab-1',
          posted_at: '2026-10-01T09:00:00Z',
          due: '2026-10-15',
          day: '12.10.2026.',
          note: 'see https://example.org first',
        },
      }),
    ).toEqual(['Lab 1', '12.10.2026.', 'see https://example.org first']);
  });

  it('takes each string once, trimmed, none empty', () => {
    expect(
      postStrings({
        title: 'Welcome',
        raw: { title: ' Welcome ', a: 'hi', b: 'hi', c: '  ' },
      }),
    ).toEqual(['Welcome', 'hi']);
    expect(postStrings({ title: null, raw: {} })).toEqual([]);
  });

  it(`takes up to ${MAX_POST_HTML} characters in all, the last string cut`, () => {
    const half = 'x'.repeat(MAX_POST_HTML / 2 + 1);

    const strings = postStrings({
      title: null,
      raw: [half, `${half}y`, 'past it'],
    });

    expect(strings.map(({ length }) => length)).toEqual([
      half.length,
      MAX_POST_HTML - half.length,
    ]);
  });
});

describe('postText', () => {
  // "<p>hi</p>" and "hi" read alike
  it('is the texts read, each once, in their order, the empty ones left out', () => {
    expect(postText(['Exam', 'on Monday', ' ', 'Exam', 'on Monday '])).toBe(
      'Exam\n\non Monday',
    );
    expect(postText([])).toBe('');
  });

  it(`is cut at ${MAX_POST_CHARS} characters`, () => {
    expect(postText(['x'.repeat(MAX_POST_CHARS + 10)])).toHaveLength(
      MAX_POST_CHARS,
    );
  });
});
