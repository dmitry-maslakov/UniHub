import { errors, type Client } from '@opensearch-project/opensearch';
import { PluginName } from '@app/kernel';
import { sha256 } from '../../../../test/sha256.js';
import { TextIndexUnavailableError } from '../../application/ports.js';
import { chunksOf, HIGHLIGHT } from '../../domain/chunks.js';
import { OpenSearchTextIndex } from './opensearch-text-index.js';
import {
  indexBody,
  indexName,
  PIPELINE,
  type Vectors,
} from './text-index.mapping.js';
import { keywordBody, searchRequest } from './text-index.search.js';

const index = indexName('unihub', null);
const vectors = { model: 'bge-m3-5617a9f6', dimensions: 3 };
const key = {
  hash: sha256('%PDF lecture'),
  processor: PluginName.parse('office-text'),
  version: 2,
};
const pages = (n: number) =>
  chunksOf(Array.from({ length: n }, (_, i) => `page ${i + 1}`));

const refused = (statusCode: number, type: string, reason = `${type} here`) =>
  new errors.ResponseError({
    body: { error: { type, reason }, status: statusCode },
    statusCode,
  } as ConstructorParameters<typeof errors.ResponseError>[0]);
const items = (...failed: [status: number, type: string][]) => ({
  body: {
    errors: true,
    items: failed.map(([status, type]) => ({
      index: { _index: index, status, error: { type, reason: `${type} here` } },
    })),
  },
});
const ok = { body: { errors: false, items: [] } };
const query = { text: 'semafor', hashes: [key.hash], size: 10 };
const none = { body: { hits: { hits: [] } } };

// the calls OpenSearchTextIndex makes, answered as an index of this
// generation (and these vectors) that's there and takes every write
function opensearch(embedding: Vectors = null) {
  const name = indexName('unihub', embedding);
  const client = {
    indices: {
      create: vi.fn<(params: object) => Promise<unknown>>(async () => ({
        body: { acknowledged: true },
      })),
      getMapping: vi.fn<(params: object) => Promise<unknown>>(async () => ({
        body: { [name]: { mappings: indexBody(embedding).mappings } },
      })),
    },
    searchPipeline: {
      put: vi.fn<(params: object) => Promise<unknown>>(async () => ({
        body: { acknowledged: true },
      })),
    },
    bulk: vi.fn<(params: { body: unknown[] }) => Promise<unknown>>(
      async () => ok,
    ),
    index: vi.fn<(params: object) => Promise<unknown>>(async () => ({
      body: {},
    })),
    deleteByQuery: vi.fn<(params: object) => Promise<unknown>>(async () => ({
      body: {},
    })),
    search: vi.fn<(params: object) => Promise<unknown>>(async () => ({
      body: { aggregations: { keys: { buckets: [] } } },
    })),
  };
  const text = new OpenSearchTextIndex(
    client as unknown as Client,
    { url: 'http://opensearch:9200', prefix: 'unihub' },
    {
      embedding: embedding && {
        ...embedding,
        url: 'http://embedder',
        queryUrl: 'http://embedder',
      },
      rerank: null,
    },
  );
  return { client, text };
}

describe('OpenSearchTextIndex', () => {
  it('writes the chunks 200 at a time, then the manifest, then drops the other versions', async () => {
    const { client, text } = opensearch();

    await text.put(key, pages(450));

    expect(client.bulk.mock.calls.map(([{ body }]) => body.length / 2)).toEqual(
      [200, 200, 50],
    );
    expect(client.bulk.mock.calls[0][0].body.slice(0, 2)).toEqual([
      { index: { _id: `${key.hash}__office-text__2__1__0` } },
      { ...key, page: 1, chunk: 0, text: 'page 1' },
    ]);
    expect(client.index).toHaveBeenCalledWith({
      index,
      id: `${key.hash}__office-text__2`,
      body: { ...key, chunks: 450 },
      refresh: 'wait_for',
    });
    expect(client.deleteByQuery).toHaveBeenCalledWith({
      index,
      refresh: true,
      conflicts: 'proceed',
      body: {
        query: {
          bool: {
            filter: [
              { term: { hash: key.hash } },
              { term: { processor: key.processor } },
            ],
            must_not: [{ term: { version: 2 } }],
          },
        },
      },
    });
    const [bulk, manifest, drop] = [
      client.bulk.mock.invocationCallOrder.at(-1)!,
      client.index.mock.invocationCallOrder[0],
      client.deleteByQuery.mock.invocationCallOrder[0],
    ];
    expect(bulk < manifest && manifest < drop).toBe(true);
  });

  it('writes only the manifest of a text without chunks', async () => {
    const { client, text } = opensearch();

    await text.put(key, []);

    expect(client.bulk).not.toHaveBeenCalled();
    expect(client.index).toHaveBeenCalledWith(
      expect.objectContaining({ body: { ...key, chunks: 0 } }),
    );
  });

  it('makes the index the first time it is needed, once, and takes one already there', async () => {
    const { client, text } = opensearch();
    client.indices.create.mockRejectedValueOnce(
      refused(400, 'resource_already_exists_exception'),
    );

    await text.put(key, pages(1));
    await text.remove(key);

    expect(client.indices.create).toHaveBeenCalledTimes(1);
    expect(client.indices.create).toHaveBeenCalledWith({
      index,
      body: indexBody(null),
    });
    expect(client.searchPipeline.put).not.toHaveBeenCalled();
  });

  it('puts the hybrid pipeline before it makes an index of vectors, named by their model', async () => {
    const { client, text } = opensearch(vectors);

    await text.ensure();

    expect(client.searchPipeline.put).toHaveBeenCalledWith({
      id: 'unihub-hybrid',
      body: PIPELINE,
    });
    expect(client.indices.create).toHaveBeenCalledWith({
      index: 'unihub-texts-g1-bge-m3-5617a9f6-3',
      body: indexBody(vectors),
    });
    expect(
      client.searchPipeline.put.mock.invocationCallOrder[0] <
        client.indices.create.mock.invocationCallOrder[0],
    ).toBe(true);
  });

  it('refuses an index of another mapping or other vectors', async () => {
    for (const [embedding, other] of [
      [null, { generation: 0 }],
      [vectors, { ...indexBody(vectors).mappings._meta, model: 'bge-m3' }],
      [vectors, { ...indexBody(vectors).mappings._meta, dimensions: 1024 }],
      [vectors, undefined],
    ] as const) {
      const { client, text } = opensearch(embedding);
      const name = indexName('unihub', embedding);
      client.indices.getMapping.mockResolvedValue({
        body: { [name]: { mappings: { _meta: other } } },
      });

      const failed = text.put(key, pages(1));

      await expect(failed).rejects.toThrow(
        `index ${name} exists with another mapping`,
      );
      await expect(failed).rejects.not.toBeInstanceOf(
        TextIndexUnavailableError,
      );
      expect(client.bulk).not.toHaveBeenCalled();
    }
  });

  it("writes each chunk's vector with it", async () => {
    const { client, text } = opensearch(vectors);

    await text.put(key, [{ page: 1, chunk: 0, text: 'a', vector: [1, 0, 0] }]);

    expect(client.bulk.mock.calls[0][0].body[1]).toEqual({
      ...key,
      page: 1,
      chunk: 0,
      text: 'a',
      vector: [1, 0, 0],
    });
  });

  it('asks again after making the index failed', async () => {
    const { client, text } = opensearch();
    client.indices.create.mockRejectedValueOnce(
      new errors.ConnectionError('Connection Error'),
    );

    await expect(text.put(key, pages(1))).rejects.toBeInstanceOf(
      TextIndexUnavailableError,
    );
    await text.put(key, pages(1));

    expect(client.indices.create).toHaveBeenCalledTimes(2);
  });

  it('takes items all refused for a full disk for an outage, and writes no manifest', async () => {
    const { client, text } = opensearch();
    client.bulk.mockResolvedValue(
      items([429, 'cluster_block_exception'], [429, 'cluster_block_exception']),
    );

    await expect(text.put(key, pages(2))).rejects.toBeInstanceOf(
      TextIndexUnavailableError,
    );
    expect(client.index).not.toHaveBeenCalled();
  });

  it('takes an index it cannot make for a full disk for an outage', async () => {
    const { client, text } = opensearch();
    client.indices.create.mockRejectedValue(
      refused(403, 'index_create_block_exception'),
    );

    await expect(text.put(key, pages(1))).rejects.toBeInstanceOf(
      TextIndexUnavailableError,
    );
  });

  it('takes a node away or stuck for an outage, of the unavailable kind the edges answer', async () => {
    const { client, text } = opensearch();
    const timeout = new errors.TimeoutError('Request timed out', {} as never);
    client.deleteByQuery.mockRejectedValue(timeout);

    const failed = text.remove(key);

    await expect(failed).rejects.toBeInstanceOf(TextIndexUnavailableError);
    await expect(failed).rejects.toMatchObject({
      kind: 'unavailable',
      reason: 'SEARCH_INDEX_UNAVAILABLE',
      cause: timeout,
    });
  });

  it('fails a write whose items fail otherwise, saying why, with no manifest', async () => {
    const { client, text } = opensearch();
    client.bulk.mockResolvedValue(
      items(
        [429, 'cluster_block_exception'],
        [400, 'mapper_parsing_exception'],
        [400, 'mapper_parsing_exception'],
        [400, 'illegal_argument_exception'],
      ),
    );

    const failed = text.put(key, pages(4));

    await expect(failed).rejects.toThrow(
      'bulk failed: cluster_block_exception: cluster_block_exception here; mapper_parsing_exception: mapper_parsing_exception here; mapper_parsing_exception: mapper_parsing_exception here',
    );
    await expect(failed).rejects.not.toBeInstanceOf(TextIndexUnavailableError);
    expect(client.index).not.toHaveBeenCalled();
  });

  it('makes the index again when a write finds it gone, and writes the whole text once more', async () => {
    const { client, text } = opensearch();
    await text.put(key, pages(1));
    client.bulk.mockResolvedValueOnce(
      items([404, 'index_not_found_exception']),
    );
    client.index.mockClear();

    await text.put(key, pages(1));

    expect(client.indices.create).toHaveBeenCalledTimes(2);
    expect(client.bulk).toHaveBeenCalledTimes(3);
    expect(client.index).toHaveBeenCalledTimes(1);
  });

  it('takes an index gone again right after it was made for an outage', async () => {
    const { client, text } = opensearch();
    client.index.mockRejectedValue(refused(404, 'index_not_found_exception'));

    await expect(text.put(key, pages(1))).rejects.toBeInstanceOf(
      TextIndexUnavailableError,
    );
    expect(client.indices.create).toHaveBeenCalledTimes(2);
    expect(client.index).toHaveBeenCalledTimes(2);
  });

  it('removes every version of a text', async () => {
    const { client, text } = opensearch();

    await text.remove(key);

    expect(client.deleteByQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          query: {
            bool: {
              filter: [
                { term: { hash: key.hash } },
                { term: { processor: key.processor } },
              ],
            },
          },
        },
      }),
    );
  });

  it('lists the manifests page by page', async () => {
    const { client, text } = opensearch();
    const older = { ...key, version: 1 };
    client.search
      .mockResolvedValueOnce({
        body: {
          aggregations: {
            keys: { buckets: [{ key: older }, { key }], after_key: key },
          },
        },
      })
      .mockRejectedValueOnce(refused(404, 'index_not_found_exception'));

    const keys = [];
    for await (const listed of text.keys()) keys.push(listed);

    expect(keys).toEqual([older, key]);
    // the second page found the index gone: made again, asked once more
    const asked = client.search.mock.calls.map(([params]) => params);
    expect(asked).toHaveLength(3);
    expect(asked[0]).not.toHaveProperty('body.aggs.keys.composite.after');
    expect(asked[2]).toMatchObject({
      index,
      body: {
        query: { exists: { field: 'chunks' } },
        aggs: { keys: { composite: { after: key } } },
      },
    });
    expect(client.indices.create).toHaveBeenCalledTimes(2);
  });

  it('asks whether the index is there every time it is told to make sure', async () => {
    const { client, text } = opensearch();

    await text.ensure();
    await text.ensure();

    expect(client.indices.create).toHaveBeenCalledTimes(2);
  });

  it('searches within 5 s, a hit per content read back as its best pages', async () => {
    const { client, text } = opensearch();
    const { open, close } = HIGHLIGHT;
    client.search.mockResolvedValueOnce({
      body: {
        hits: {
          hits: [
            {
              _source: { hash: key.hash },
              inner_hits: {
                pages: {
                  hits: {
                    hits: [
                      {
                        _source: {
                          processor: key.processor,
                          version: 2,
                          page: 3,
                        },
                        highlight: { text: [`a ${open}semafor${close}`] },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    });

    const hits = await text.search(query);

    expect(client.search).toHaveBeenCalledWith(
      { index, body: keywordBody(query) },
      { requestTimeout: 5_000 },
    );
    expect(hits).toEqual([
      {
        hash: key.hash,
        pages: [
          {
            processor: key.processor,
            version: 2,
            page: 3,
            snippet: { text: 'a semafor', highlights: [[2, 9]] },
          },
        ],
      },
    ]);
  });

  // making sure of it would wait the client's 30 s on a stuck node
  it('searches without making sure of the index first', async () => {
    const { client, text } = opensearch();
    client.indices.create.mockReturnValue(new Promise(() => {}));
    client.search.mockResolvedValueOnce(none);

    expect(await text.search(query)).toEqual([]);
    expect(client.indices.create).not.toHaveBeenCalled();
  });

  it('takes a search stuck past its time for an outage', async () => {
    const { client, text } = opensearch();
    client.search.mockRejectedValue(
      new errors.TimeoutError('Request timed out', {} as never),
    );

    await expect(text.search(query)).rejects.toBeInstanceOf(
      TextIndexUnavailableError,
    );
  });

  it('makes the index again when a search finds it gone, and finds nothing in it', async () => {
    const { client, text } = opensearch();
    client.search
      .mockRejectedValueOnce(refused(404, 'index_not_found_exception'))
      .mockResolvedValueOnce(none);

    expect(await text.search(query)).toEqual([]);
    expect(client.indices.create).toHaveBeenCalledTimes(1);
    expect(client.search).toHaveBeenCalledTimes(2);
  });

  it('searches through the pipeline in an index of vectors, with none in one without', async () => {
    const vector = [0, 0.6, 0.8];
    for (const [embedding, pipeline] of [
      [vectors, 'unihub-hybrid'],
      [null, null],
    ] as const) {
      const { client, text } = opensearch(embedding);
      client.search.mockResolvedValueOnce(none);

      await text.search({ ...query, vector });

      expect(client.search).toHaveBeenCalledWith(
        {
          index: indexName('unihub', embedding),
          ...searchRequest({ ...query, vector }, pipeline),
        },
        { requestTimeout: 5_000 },
      );
    }
  });

  it('puts the pipeline again when a search finds it gone, and asks once more', async () => {
    const { client, text } = opensearch(vectors);
    client.search
      .mockRejectedValueOnce(
        refused(
          400,
          'illegal_argument_exception',
          'Pipeline unihub-hybrid is not defined',
        ),
      )
      .mockResolvedValueOnce(none);

    expect(await text.search({ ...query, vector: [1, 0, 0] })).toEqual([]);
    expect(client.searchPipeline.put).toHaveBeenCalledTimes(1);
    expect(client.search).toHaveBeenCalledTimes(2);
  });

  it('takes a pipeline gone again right after it was put for an outage', async () => {
    const { client, text } = opensearch(vectors);
    client.search.mockRejectedValue(
      refused(
        400,
        'illegal_argument_exception',
        'Pipeline unihub-hybrid is not defined',
      ),
    );

    await expect(
      text.search({ ...query, vector: [1, 0, 0] }),
    ).rejects.toBeInstanceOf(TextIndexUnavailableError);
    expect(client.search).toHaveBeenCalledTimes(2);
  });

  it('lets a search the index refuses otherwise through as it came', async () => {
    const { client, text } = opensearch();
    const tooMany = refused(400, 'illegal_argument_exception');
    client.search.mockRejectedValue(tooMany);

    await expect(text.search(query)).rejects.toBe(tooMany);
  });
});
