import { PostTextHandler } from './post-text.handler.js';
import { PlainHtmlText } from './processing.fakes.js';
import { GetPostTextQuery } from './queries.js';

describe('PostTextHandler', () => {
  it("reads a post's strings as plain text, without its title", async () => {
    const html = new PlainHtmlText();
    const text = await new PostTextHandler(html).execute(
      new GetPostTextQuery({
        message: '<p>On Monday</p>',
        // the portal's own values rather than words
        url: 'https://canvas.example.edu/courses/1',
        posted_at: '2026-11-01T10:00:00Z',
        again: '<p>On Monday</p>',
        files: [{ name: 'rules.pdf' }],
      }),
    );

    // each string once, in the order the portal gave them, and no title:
    // the page has it as its heading
    expect(text).toBe('<p>On Monday</p>\n\nrules.pdf');
    expect(html.read).toEqual([['<p>On Monday</p>', 'rules.pdf']]);
  });

  it('says nothing for a post with no words', async () => {
    expect(
      await new PostTextHandler(new PlainHtmlText()).execute(
        new GetPostTextQuery({ n: 3, at: '2026-11-01' }),
      ),
    ).toBe('');
  });
});
