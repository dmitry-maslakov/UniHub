import { textSearchSettings } from './text-search.config.js';

const embedder = {
  EMBEDDING_URL: 'http://embedder',
  EMBEDDING_MODEL: 'bge-m3-5617a9f6',
  EMBEDDING_DIMENSIONS: '1024',
};

describe('text search settings', () => {
  it("take no embedder as BM25 only, no reranker as the index's order, empty values as unset", () => {
    expect(textSearchSettings.parse({})).toEqual({
      embedding: null,
      rerank: null,
    });
    expect(
      textSearchSettings.parse({
        EMBEDDING_URL: '',
        EMBEDDING_QUERY_URL: '',
        EMBEDDING_MODEL: '',
        EMBEDDING_DIMENSIONS: '',
        RERANK_URL: '',
      }),
    ).toEqual({ embedding: null, rerank: null });
  });

  it('give the reranker the best 20 unless told how many, 1 to 50', () => {
    const reranker = { RERANK_URL: 'http://reranker' };
    expect(textSearchSettings.parse(reranker).rerank).toEqual({
      url: 'http://reranker',
      candidates: 20,
    });
    expect(
      textSearchSettings.parse({ ...reranker, RERANK_CANDIDATES: '50' }).rerank
        ?.candidates,
    ).toBe(50);
    for (const bad of [
      { RERANK_URL: 'reranker' },
      { RERANK_CANDIDATES: '0' },
      { RERANK_CANDIDATES: '51' },
      { RERANK_CANDIDATES: '2.5' },
    ])
      expect(
        textSearchSettings.safeParse({ ...reranker, ...bad }).success,
      ).toBe(false);
  });

  it('send queries to the same embedder unless they have their own', () => {
    expect(textSearchSettings.parse(embedder).embedding).toEqual({
      url: 'http://embedder',
      queryUrl: 'http://embedder',
      model: 'bge-m3-5617a9f6',
      dimensions: 1024,
    });
    expect(
      textSearchSettings.parse({
        ...embedder,
        EMBEDDING_QUERY_URL: 'http://embedder-query',
      }).embedding?.queryUrl,
    ).toBe('http://embedder-query');
  });

  it('need the model and its dimensions with an embedder', () => {
    for (const missing of ['EMBEDDING_MODEL', 'EMBEDDING_DIMENSIONS']) {
      const result = textSearchSettings.safeParse({
        ...embedder,
        [missing]: '',
      });
      expect(result.error?.issues.map((i) => i.path[0])).toEqual([
        'EMBEDDING_URL',
      ]);
    }
  });

  it('refuse an embedder not named by url, a model not named as an index is, and no dimensions', () => {
    for (const bad of [
      { EMBEDDING_URL: 'embedder' },
      { EMBEDDING_QUERY_URL: 'embedder-query' },
      { EMBEDDING_MODEL: 'BAAI/bge-m3' },
      { EMBEDDING_DIMENSIONS: '0' },
      { EMBEDDING_DIMENSIONS: '10.5' },
    ])
      expect(
        textSearchSettings.safeParse({ ...embedder, ...bad }).success,
      ).toBe(false);
  });
});
