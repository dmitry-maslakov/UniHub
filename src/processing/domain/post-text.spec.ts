import { MAX_POST_CHARS, postText } from './post-text.js';

describe('postText', () => {
  it('is the title, then the HTML the portal gave as plain text: no tags, scripts or styles, entities decoded', async () => {
    expect(
      await postText({
        title: 'Exam',
        raw: {
          message:
            '<p>The exam is on <b>Monday</b>&nbsp;&amp; Tuesday.</p><script>track()</script><style>p{}</style><ul><li>room 1</li></ul>',
        },
      }),
    ).toBe('Exam\n\nThe exam is on Monday\u00a0& Tuesday.\n- room 1');
  });

  // the hub knows no portal's fields: a page's body, an assignment's
  // description, an attachment's name, a module's items' titles
  it("takes every string in raw, at any depth, in raw's order, plain text as it is", async () => {
    expect(
      await postText({
        title: null,
        raw: {
          body: 'Bring a pen, a < b',
          points: 10,
          published: true,
          attachments: [{ display_name: 'schedule.pdf', size: 3 }],
          items: [{ title: 'Lecture 1' }, null],
        },
      }),
    ).toBe('Bring a pen, a < b\n\nschedule.pdf\n\nLecture 1');
  });

  it("leaves out links and dates, the portal's own values rather than words", async () => {
    expect(
      await postText({
        title: 'Lab 1',
        raw: {
          html_url: 'https://canvas.example.edu/courses/101/pages/lab-1',
          posted_at: '2026-10-01T09:00:00Z',
          due: '2026-10-15',
          day: '12.10.2026.',
          note: 'see https://example.org first',
        },
      }),
    ).toBe('Lab 1\n\n12.10.2026.\n\nsee https://example.org first');
  });

  it('says each thing once: the title raw repeats, the same text twice', async () => {
    expect(
      await postText({
        title: 'Welcome',
        raw: { title: 'Welcome', a: '<p>hi</p>', b: 'hi', c: '  ' },
      }),
    ).toBe('Welcome\n\nhi');
  });

  it('leaves out a string officeparser refuses, nested past its limit', async () => {
    const deep = `${'<div>'.repeat(300)}deep${'</div>'.repeat(300)}`;

    expect(await postText({ title: 'Kept', raw: { body: deep } })).toBe('Kept');
  });

  it('is nothing for a post without words', async () => {
    expect(await postText({ title: null, raw: {} })).toBe('');
  });

  it(`is cut at ${MAX_POST_CHARS} characters`, async () => {
    const long = 'semafor '.repeat(MAX_POST_CHARS / 4);

    expect(await postText({ title: null, raw: long })).toHaveLength(
      MAX_POST_CHARS,
    );
  });
});
