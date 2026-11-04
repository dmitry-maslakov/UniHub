import { differs } from './changes.js';

describe('differs', () => {
  const current = {
    title: 'Lecture 5',
    url: null as string | null,
    publishedAt: new Date('2026-10-29T14:12:00Z'),
    raw: { guid: '11163', tags: ['a', 'b'] },
  };

  it('ignores what the portal sent again unchanged', () => {
    expect(
      differs(current, {
        title: 'Lecture 5',
        url: undefined,
        publishedAt: new Date('2026-10-29T14:12:00Z'),
        raw: { tags: ['a', 'b'], guid: '11163' },
      }),
    ).toBe(false);
  });

  it('notices a changed field', () => {
    expect(differs(current, { title: 'Lecture 5 (updated)' })).toBe(true);
    expect(differs(current, { raw: { guid: '11163', tags: ['a'] } })).toBe(
      true,
    );
    expect(differs(current, { url: 'https://example.com' })).toBe(true);
  });
});
