import { StoredJson, StoredText } from './stored.js';

describe('StoredText', () => {
  it('refuses a NUL, which postgres refuses', () => {
    expect(StoredText.safeParse('a\u0000b').success).toBe(false);
  });

  it('takes a lone surrogate as the U+FFFD postgres keeps', () => {
    expect(StoredText.parse('a\ud800b😀c\udc00')).toBe('a\uFFFDb😀c\uFFFD');
  });

  it('keeps its checks under further rules', () => {
    expect(StoredText.trim().min(1).parse(' \ud83d ')).toBe('\uFFFD');
    expect(StoredText.min(1).safeParse('\u0000').success).toBe(false);
  });
});

describe('StoredJson', () => {
  it('refuses a NUL anywhere in it', () => {
    for (const bad of ['a\u0000', { k: ['\u0000'] }, { 'k\u0000': 1 }])
      expect(StoredJson.safeParse(bad).success).toBe(false);
  });

  it('takes strings, keys and -0 as postgres keeps them', () => {
    const parsed = StoredJson.parse({
      'k\udc00': [-0, 'x\ud800', null, { n: 1.5, ok: true }],
    });
    expect(parsed).toEqual({
      'k\uFFFD': [0, 'x\uFFFD', null, { n: 1.5, ok: true }],
    });
    expect(
      Object.is((parsed as { 'k\uFFFD': number[] })['k\uFFFD'][0], 0),
    ).toBe(true);
    expect(Object.is(StoredJson.parse(-0), 0)).toBe(true);
  });
});
