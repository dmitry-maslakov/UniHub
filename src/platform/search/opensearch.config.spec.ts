import { opensearchSettings } from './opensearch.config.js';

describe('opensearch settings', () => {
  it('need the node, by url, and name indices unihub-… unless told', () => {
    expect(
      opensearchSettings.parse({ OPENSEARCH_URL: 'http://opensearch:9200' }),
    ).toEqual({ url: 'http://opensearch:9200', prefix: 'unihub' });
    expect(
      opensearchSettings.parse({
        OPENSEARCH_URL: 'http://localhost:9200',
        OPENSEARCH_INDEX_PREFIX: 'unihub-e2e',
      }).prefix,
    ).toBe('unihub-e2e');
  });

  it('refuse a node not named by url, and a prefix no index name starts with', () => {
    for (const bad of [
      {},
      { OPENSEARCH_URL: '' },
      { OPENSEARCH_URL: 'opensearch' },
      { OPENSEARCH_URL: 'http://localhost:9200', OPENSEARCH_INDEX_PREFIX: '' },
      {
        OPENSEARCH_URL: 'http://localhost:9200',
        OPENSEARCH_INDEX_PREFIX: 'UniHub',
      },
      {
        OPENSEARCH_URL: 'http://localhost:9200',
        OPENSEARCH_INDEX_PREFIX: '-unihub',
      },
    ])
      expect(opensearchSettings.safeParse(bad).success).toBe(false);
  });
});
