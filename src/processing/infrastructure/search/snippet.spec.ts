import { snippetOf } from './snippet.js';

describe('snippetOf', () => {
  it('takes the tags out and says where they were', () => {
    expect(snippetOf('a \uE000semafor\uE001 b \uE000mreža\uE001')).toEqual({
      text: 'a semafor b mreža',
      highlights: [
        [2, 9],
        [12, 17],
      ],
    });
  });

  it('joins highlights that touch, keeping apart those that do not', () => {
    expect(
      snippetOf('\uE000camel\uE001\uE000Case\uE001 \uE000x\uE001'),
    ).toEqual({
      text: 'camelCase x',
      highlights: [
        [0, 9],
        [10, 11],
      ],
    });
  });

  it('takes a fragment without tags as it is', () => {
    expect(snippetOf('nothing matched here')).toEqual({
      text: 'nothing matched here',
      highlights: [],
    });
  });

  it('leaves HTML as it came, to be shown as text', () => {
    expect(snippetOf('<script>\uE000alert\uE001(1)</script>')).toEqual({
      text: '<script>alert(1)</script>',
      highlights: [[8, 13]],
    });
  });

  it('counts in UTF-16 units, past astral characters too', () => {
    const { text, highlights } = snippetOf('😀 𝑥 \uE000čas\uE001');

    expect(highlights).toEqual([[6, 9]]);
    expect(text.slice(...highlights[0])).toBe('čas');
  });
});
