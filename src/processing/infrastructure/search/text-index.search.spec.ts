import { PluginName } from '@app/kernel';
import { sha256 } from '../../../../test/sha256.js';
import { HIGHLIGHT } from '../../domain/chunks.js';
import { contentHits, keywordBody } from './text-index.search.js';

// On a small index a post_filter finds what the query's own filter does
// (the e2e specs can't tell them apart), on a big one too few or none.
describe('keywordBody', () => {
  const hashes = [sha256('lecture'), sha256('exercises')];
  const body = keywordBody({ text: 'semafor', hashes, size: 7 });

  it('looks only through the contents named, in the query itself', () => {
    expect(body.query.bool.filter).toEqual({ terms: { hash: hashes } });
    expect(body.query.bool.filter.terms.hash).toBe(hashes);
    expect(body).not.toHaveProperty('post_filter');
  });

  it('asks for that many contents, a hit each with more of its best chunks than pages shown', () => {
    expect(body.size).toBe(7);
    expect(body.collapse).toMatchObject({
      field: 'hash',
      inner_hits: { name: 'pages', size: 10 },
    });
  });

  it('matches the words in every analysis of the text', () => {
    expect(body.query.bool.must.multi_match).toEqual({
      query: 'semafor',
      type: 'most_fields',
      fields: ['text', 'text.sr', 'text.en', 'text.code'],
    });
  });
});

describe('contentHits', () => {
  const hash = sha256('%PDF lecture');
  const officeText = PluginName.parse('office-text');
  const plainText = PluginName.parse('plain-text');
  // a chunk as an inner hit: its page and a fragment marked where `word` is
  const chunk = (page: number, word: string, processor = officeText) => ({
    _source: { processor, version: 2, page },
    highlight: {
      text: [`page ${page}: ${HIGHLIGHT.open}${word}${HIGHLIGHT.close}`],
    },
  });
  const hitOf = (...chunks: ReturnType<typeof chunk>[]) => [
    {
      _source: { hash },
      inner_hits: { pages: { hits: { hits: chunks, max_score: 1 } } },
    },
  ];
  const shown = ({ hash, pages }: ReturnType<typeof contentHits>[number]) => ({
    hash,
    pages: pages.map(({ processor, page, snippet }) => [
      processor,
      page,
      snippet.text,
    ]),
  });

  it('reads a page and its snippet from each chunk', () => {
    expect(contentHits(hitOf(chunk(4, 'semafor')))).toEqual([
      {
        hash,
        pages: [
          {
            processor: officeText,
            version: 2,
            page: 4,
            snippet: { text: 'page 4: semafor', highlights: [[8, 15]] },
          },
        ],
      },
    ]);
  });

  it('shows a page once, by the best of its chunks, those of other processors apart', () => {
    const [found] = contentHits(
      hitOf(
        chunk(3, 'best'),
        chunk(1, 'next'),
        chunk(3, 'worse'),
        chunk(3, 'other', plainText),
      ),
    );

    expect(shown(found).pages).toEqual([
      [officeText, 3, 'page 3: best'],
      [officeText, 1, 'page 1: next'],
      [plainText, 3, 'page 3: other'],
    ]);
  });

  // a long page whose chunks all outrank the rest hides no other page
  it('shows three pages, past more best chunks of one', () => {
    const [found] = contentHits(
      hitOf(
        chunk(4, 'a'),
        chunk(4, 'b'),
        chunk(4, 'c'),
        chunk(9, 'd'),
        chunk(4, 'e'),
        chunk(2, 'f'),
        chunk(7, 'g'),
      ),
    );

    expect(shown(found).pages).toEqual([
      [officeText, 4, 'page 4: a'],
      [officeText, 9, 'page 9: d'],
      [officeText, 2, 'page 2: f'],
    ]);
  });
});
