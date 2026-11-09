import { PluginName } from '@app/kernel';
import { sha256 } from '../../../../test/sha256.js';
import { HIGHLIGHT } from '../../domain/chunks.js';
import {
  contentHits,
  hybridBody,
  keywordBody,
  searchRequest,
  words as wordsQuery,
} from './text-index.search.js';

const processors = [PluginName.parse('office-text')];
const hashes = [sha256('lecture'), sha256('exercises')];
// what a search looks through: these contents, and no records
const scope = (contents = hashes) => ({
  contents,
  posts: [],
  files: [],
  archives: [],
});
// the contents named, by the processors on
const texts = (contents: string[]) => ({
  bool: {
    filter: [
      { terms: { hash: contents } },
      { terms: { processor: processors } },
    ],
  },
});
const among = (...should: object[]) => ({
  bool: { should, minimum_should_match: 1 },
});
const words = { text: 'semafor', processors, size: 7 };
// the contents a filter names: the very list it was given
const contentsIn = (filter: { bool: { should: object[] } }) =>
  (filter.bool.should[0] as ReturnType<typeof texts>).bool.filter[0].terms.hash;

// On a small index a post_filter finds what the query's own filter does
// (the e2e specs can't tell them apart), on a big one too few or none.
describe('keywordBody', () => {
  const body = keywordBody({ ...words, among: scope() });

  it('looks only through the texts of the contents and processors named, in the query itself', () => {
    expect(body.query.bool.filter).toEqual(among(texts(hashes)));
    expect(contentsIn(body.query.bool.filter)).toBe(hashes);
    expect(body).not.toHaveProperty('post_filter');
  });

  // a name or a path by the words of the record named alone, whoever's
  // content it names; the processors are the texts'
  it('looks through the posts, files and archives named, each of its kind', () => {
    const records = { posts: ['p1'], files: ['f1'], archives: [hashes[1]] };
    const of = (kind: string, ids: string[]) => ({
      bool: { filter: [{ term: { kind } }, { terms: { record: ids } }] },
    });

    expect(
      keywordBody({ ...words, among: { contents: hashes, ...records } }).query
        .bool.filter,
    ).toEqual(
      among(
        texts(hashes),
        of('post', ['p1']),
        of('file', ['f1']),
        of('tree', [hashes[1]]),
      ),
    );
    expect(
      keywordBody({ ...words, among: { contents: [], ...records } }).query.bool
        .filter.bool.should,
    ).toHaveLength(3);
  });

  it('asks for that many contents, a hit each with more of its best chunks than pages shown, of texts and records', () => {
    expect(body.size).toBe(7);
    expect(body.collapse).toMatchObject({
      field: 'hash',
      inner_hits: {
        name: 'pages',
        size: 10,
        _source: ['processor', 'version', 'page', 'kind', 'record', 'member'],
      },
    });
  });

  it('matches the words in every analysis of the text, exactly', () => {
    expect(body.query.bool.must.bool.should[0].multi_match).toEqual({
      query: 'semafor',
      type: 'most_fields',
      fields: ['text', 'text.sr', 'text.en', 'text.code'],
      boost: 2,
    });
  });
});

describe('words', () => {
  const fuzzy = (text: string) => wordsQuery(text).bool.should[1]?.multi_match;

  it('allows a typo in the analyses of natural text, not in the code one', () => {
    expect(fuzzy('algoritmi')).toEqual({
      query: 'algoritmi',
      type: 'most_fields',
      fields: ['text', 'text.sr', 'text.en'],
      fuzziness: 'AUTO:4,8',
      prefix_length: 1,
      max_expansions: 20,
    });
  });

  it('leaves identifiers out of the fuzzy part, keeping the other words', () => {
    expect(fuzzy('camelCaseName')).toBeUndefined();
    expect(fuzzy('snake_case')).toBeUndefined();
    expect(fuzzy('x2')).toBeUndefined();
    expect(fuzzy('semafor getUserName  niti')?.query).toBe('semafor niti');
    expect(wordsQuery('getUserName').bool.should[0].multi_match.query).toBe(
      'getUserName',
    );
  });

  it('leaves out the words of a dotted or slashed identifier, not a sentence-ending period', () => {
    expect(fuzzy('main.c')).toBeUndefined();
    expect(fuzzy('src/main.c')).toBeUndefined();
    expect(fuzzy('algoritmi.')?.query).toBe('algoritmi.');
  });

  it('has no fuzzy part for more words than a query may hold clauses for', () => {
    const some = (n: number) =>
      Array.from(
        { length: n },
        (_, i) => `rec${'abcdefghijklmnopqrstu'[i]}`,
      ).join(' ');
    expect(fuzzy(some(16))).toBeDefined();
    expect(fuzzy(some(17))).toBeUndefined();
    expect(wordsQuery(some(17)).bool.should).toHaveLength(1);
  });

  it('does not take a capital or a name for an identifier', () => {
    expect(fuzzy('Algoritmi OOP')?.query).toBe('Algoritmi OOP');
  });
});

describe('hybridBody', () => {
  const vector = [0.6, 0.8];
  const body = hybridBody({ ...words, vector, among: scope() });

  // a filter of knn's own would leave the words unfiltered, a bool around
  // the hybrid query is refused: the hybrid query's filter goes to both
  it('looks only through the texts of the contents and processors named, in both parts, before knn picks its nearest', () => {
    expect(body.query.hybrid.filter).toEqual(among(texts(hashes)));
    expect(contentsIn(body.query.hybrid.filter)).toBe(hashes);
    expect(body).not.toHaveProperty('post_filter');
    expect(JSON.stringify(body.query.hybrid.queries)).not.toContain('filter');
  });

  it('asks by the words, as a keyword search does, and by the meaning, 100 deep', () => {
    const [byWords, byMeaning] = body.query.hybrid.queries;

    expect(body.query.hybrid.queries).toHaveLength(2);
    expect(byWords).toEqual(
      keywordBody({ ...words, among: scope() }).query.bool.must,
    );
    expect(byMeaning).toEqual({
      knn: {
        vector: { vector, k: 100, method_parameters: { ef_search: 256 } },
      },
    });
    expect(body.query.hybrid.pagination_depth).toBe(100);
  });

  it('answers contents as a keyword search does', () => {
    const { query: _words, ...rest } = keywordBody({
      ...words,
      among: scope(),
    });
    const { query: _both, ...same } = body;

    expect(same).toEqual(rest);
  });
});

describe('searchRequest', () => {
  const query = { ...words, among: scope([sha256('lecture')]) };
  const vector = [0.6, 0.8];

  it('asks by the words and the meaning through the pipeline, given a vector and an index of them', () => {
    expect(searchRequest({ ...query, vector }, 'unihub-hybrid')).toEqual({
      search_pipeline: 'unihub-hybrid',
      body: hybridBody({ ...query, vector }),
    });
  });

  it('asks by the words alone without a vector, or in an index without vectors', () => {
    expect(searchRequest(query, 'unihub-hybrid')).toEqual({
      body: keywordBody(query),
    });
    expect(searchRequest({ ...query, vector }, null)).toEqual({
      body: keywordBody(query),
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
  const hitOf = (...chunks: object[]) => [
    {
      _source: { hash },
      inner_hits: { pages: { hits: { hits: chunks, max_score: 1 } } },
    },
  ];
  // a record's chunk as one
  const recordChunk = (
    kind: string,
    record: string,
    word: string,
    member?: string,
  ) => ({
    _source: { kind, record, ...(member && { member }) },
    highlight: { text: [`${HIGHLIGHT.open}${word}${HIGHLIGHT.close}`] },
  });
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
        records: [],
      },
    ]);
  });

  it("reads the records found with a content apart from its pages, each once by its best chunk, a tree's members apart", () => {
    const [found] = contentHits(
      hitOf(
        recordChunk('file', 'f1', 'l5.pdf'),
        chunk(4, 'semafor'),
        recordChunk('tree', 'zip', 'lab/l5.pdf', 'lab/l5.pdf'),
        recordChunk('tree', 'zip', 'old/l5.pdf', 'old/l5.pdf'),
        recordChunk('file', 'f1', 'again'),
      ),
    );

    expect(shown(found).pages).toEqual([[officeText, 4, 'page 4: semafor']]);
    expect(found.records).toEqual([
      {
        kind: 'file',
        record: 'f1',
        member: null,
        snippet: { text: 'l5.pdf', highlights: [[0, 6]] },
      },
      expect.objectContaining({ record: 'zip', member: 'lab/l5.pdf' }),
      expect.objectContaining({ record: 'zip', member: 'old/l5.pdf' }),
    ]);
  });

  it('reads a post found by its text, each chunk of it once', () => {
    const [found] = contentHits(
      hitOf(recordChunk('post', 'p1', 'a'), recordChunk('post', 'p1', 'b')),
    );

    expect(found).toEqual({
      hash,
      pages: [],
      records: [
        {
          kind: 'post',
          record: 'p1',
          member: null,
          snippet: { text: 'a', highlights: [[0, 1]] },
        },
      ],
    });
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
