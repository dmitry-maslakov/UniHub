import { MAX_SECTION, toParts } from './parts.js';

const page = (pageNumber: number, text: string) => ({
  text,
  metadata: { sourceType: 'pdf' as const, pageNumber },
});

const under = (closestHeading: string | undefined, text: string) => ({
  text,
  metadata: { sourceType: 'docx' as const, closestHeading },
});

describe('toParts', () => {
  it('makes part n of page n, empty where a page has no text', () => {
    expect(
      toParts([page(1, 'one'), page(3, 'three'), page(3, 'table')], 'page'),
    ).toEqual(['one', '', 'three\ntable']);
  });

  it('numbers a deck by its slides', () => {
    const slide = (slideNumber: number, text: string) => ({
      text,
      metadata: { sourceType: 'pptx' as const, slideNumber },
    });
    expect(toParts([slide(2, 'two')], 'slide')).toEqual(['', 'two']);
  });

  it('puts a chunk without a number with the one before it', () => {
    const loose = { text: 'note', metadata: { sourceType: 'pdf' as const } };
    expect(toParts([loose, page(2, 'two'), loose], 'page')).toEqual([
      'note',
      'two\nnote',
    ]);
  });

  it('makes a part of each section, in order', () => {
    expect(
      toParts(
        [
          under(undefined, 'intro'),
          under('Lab 1', 'Lab 1'),
          under('Lab 1', 'Install it.'),
          under('Lab 2', 'Lab 2'),
        ],
        'heading',
      ),
    ).toEqual(['intro', 'Lab 1\nInstall it.', 'Lab 2']);
  });

  it('goes on with a long section in the next part', () => {
    const half = 'x'.repeat(MAX_SECTION / 2);
    expect(
      toParts(
        [under('A', half), under('A', half), under('A', 'end')],
        'heading',
      ),
    ).toEqual([half, `${half}\nend`]);
  });
});
