import { textSearchSettings } from './text-search.config.js';

const embedder = {
  EMBEDDING_URL: 'http://embedder',
  EMBEDDING_MODEL: 'bge-m3-5617a9f6',
  EMBEDDING_DIMENSIONS: '1024',
};

describe('text search settings', () => {
  it('take no embedder as BM25 only, empty values as unset', () => {
    expect(textSearchSettings.parse({})).toEqual({ embedding: null });
    expect(
      textSearchSettings.parse({
        EMBEDDING_URL: '',
        EMBEDDING_QUERY_URL: '',
        EMBEDDING_MODEL: '',
        EMBEDDING_DIMENSIONS: '',
      }),
    ).toEqual({ embedding: null });
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
