import { MAX_SECTION, toParts } from './parts.js';

const page = (pageNumber: number, text: string) => ({
  text,
  metadata: { sourceType: 'pdf' as const, pageNumber },
});

const under = (closestHeading: string | undefined, text: string) => ({
  text,
  metadata: { sourceType: 'docx' as const, closestHeading },
});

// a document split by heading has no pages or slides to count
const headed = (...chunks: ReturnType<typeof under>[]) => ({
  chunks,
  units: 0,
});

describe('toParts', () => {
  it('makes part n of page n, empty where a page has no text', () => {
    const chunks = [page(1, 'one'), page(3, 'three'), page(3, 'table')];
    expect(toParts({ chunks, units: 3 }, 'page')).toEqual([
      'one',
      '',
      'three\ntable',
    ]);
  });

  it('keeps the pages without text at the end', () => {
    expect(toParts({ chunks: [page(1, 'one')], units: 3 }, 'page')).toEqual([
      'one',
      '',
      '',
    ]);
  });

  it('numbers a deck by its slides', () => {
    const slide = (slideNumber: number, text: string) => ({
      text,
      metadata: { sourceType: 'pptx' as const, slideNumber },
    });
    expect(toParts({ chunks: [slide(2, 'two')], units: 2 }, 'slide')).toEqual([
      '',
      'two',
    ]);
  });

  it('puts a chunk without a number with the one before it', () => {
    const loose = { text: 'note', metadata: { sourceType: 'pdf' as const } };
    expect(
      toParts({ chunks: [loose, page(2, 'two'), loose], units: 2 }, 'page'),
    ).toEqual(['note', 'two\nnote']);
  });

  it('makes a part of each section, in order', () => {
    expect(
      toParts(
        headed(
          under(undefined, 'intro'),
          under('Lab 1', 'Lab 1'),
          under('Lab 1', 'Install it.'),
          under('Lab 2', 'Lab 2'),
        ),
        'heading',
      ),
    ).toEqual(['intro', 'Lab 1\nInstall it.', 'Lab 2']);
  });

  it('goes on with a long section in the next part', () => {
    const half = 'x'.repeat(MAX_SECTION / 2);
    expect(
      toParts(
        headed(under('A', half), under('A', half), under('A', 'end')),
        'heading',
      ),
    ).toEqual([half, `${half}\nend`]);
  });
});
