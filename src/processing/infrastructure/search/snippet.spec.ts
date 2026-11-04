import { HIGHLIGHT } from '../../domain/chunks.js';
import { snippetOf } from './snippet.js';

// as OpenSearch marks a match
const m = (match: string) => `${HIGHLIGHT.open}${match}${HIGHLIGHT.close}`;

describe('snippetOf', () => {
  it('takes the tags out and says where they were', () => {
    expect(snippetOf(`a ${m('semafor')} b ${m('mreža')}`)).toEqual({
      text: 'a semafor b mreža',
      highlights: [
        [2, 9],
        [12, 17],
      ],
    });
  });

  it('joins highlights that touch, keeping apart those that do not', () => {
    expect(snippetOf(`${m('camel')}${m('Case')} ${m('x')}`)).toEqual({
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
    expect(snippetOf(`<script>${m('alert')}(1)</script>`)).toEqual({
      text: '<script>alert(1)</script>',
      highlights: [[8, 13]],
    });
  });

  it('counts in UTF-16 units, past astral characters too', () => {
    const { text, highlights } = snippetOf(`😀 𝑥 ${m('čas')}`);

    expect(highlights).toEqual([[6, 9]]);
    expect(text.slice(...highlights[0])).toBe('čas');
  });
});
