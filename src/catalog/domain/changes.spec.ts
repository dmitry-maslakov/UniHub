import { differs, kept } from './changes.js';

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

describe('kept', () => {
  it('is what postgres gives back: no lone surrogates, no -0', () => {
    expect(kept('a\ud800b😀c')).toBe('a\uFFFDb😀c');
    expect(Object.is(kept(-0), 0)).toBe(true);
    expect(
      kept({ 'k\udc00': [-0, 'x\ud800', null], at: new Date(0), n: 1.5 }),
    ).toEqual({ 'k\uFFFD': [0, 'x\uFFFD', null], at: new Date(0), n: 1.5 });
  });

  it('makes the strict compare see them as stored', () => {
    // as sent, these differ from what postgres kept on every sync
    expect(differs({ size: 0 }, { size: -0 })).toBe(true);
    expect(differs({ size: 0 }, kept({ size: -0 }))).toBe(false);
    expect(differs({ t: '\uFFFD' }, kept({ t: '\ud800' }))).toBe(false);
  });
});
