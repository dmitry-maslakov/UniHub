import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { QueryBus } from '@nestjs/cqrs';
import type { Queue } from 'bullmq';
import type { API, Client } from '@opensearch-project/opensearch';
import type { PortalIngest } from '@app/plugin-sdk';
import { PluginName } from '@app/kernel';
import { OPENSEARCH } from '../src/platform/search/opensearch.module.js';
import {
  EmbedderUnavailableError,
  QueryEmbedder,
} from '../src/processing/application/ports.js';
import { SearchTextsQuery } from '../src/processing/contracts.js';
import { keyId } from '../src/processing/domain/representation.js';
import { SEARCH_INDEX_QUEUE } from '../src/processing/infrastructure/search/search-index.queue.js';
import {
  indexName,
  pipelineName,
} from '../src/processing/infrastructure/search/text-index.mapping.js';
import { bootApp } from './app.js';
import { testEnv, testVectors } from './env.js';
import { FakePluginsModule } from './fake-plugins.js';
import { portalIngest } from './ingest.js';
import { sha256 } from './sha256.js';

// What OpenSearch makes of SearchTextsQuery: the query's bodies, by the
// words and the meaning (FakeEmbedder's) or by the words alone, their
// filter, collapse and highlight, the hybrid pipeline, and how the answer is
// read back. Which pages are shown of the chunks it answers, and the
// bodies' parts, are checked on their own (text-index.search.spec.ts), the
// rest of the query on fakes (SearchTexts).

const portal = 'search-test';
const index = indexName(testEnv.OPENSEARCH_INDEX_PREFIX, testVectors);
const pipeline = pipelineName(testEnv.OPENSEARCH_INDEX_PREFIX);
const fakeText = PluginName.parse('fake-text');

// fake-text makes a page of each part between form feeds
const lecture = [
  'Семафори штите критичну секцију',
  'a page about nothing',
  '<script>semafor()</script> camelCaseName',
].join('\f');
const elsewhere = 'semafor, in a course nobody asked about';
const book = Array.from(
  { length: 12 },
  (_, i) => `mreža i opet mreža, strana ${i + 1}`,
).join('\f');
const sheets = [1, 2, 3].map((n) => `mreža, list ${n}`);

describe('search', { timeout: 60_000 }, () => {
  let app: INestApplication;
  let hub: PortalIngest;
  let opensearch: Client;

  const search = (text: string, contents: string[], limit = 10) =>
    app
      .get(QueryBus)
      .execute(new SearchTextsQuery(text, contents.map(sha256), limit));
  // as when the query embedder is away: by the words alone
  const byWords = (text: string, contents: string[]) => {
    vi.spyOn(app.get(QueryEmbedder), 'embed').mockRejectedValueOnce(
      new EmbedderUnavailableError('embedder.invalid: ENOTFOUND'),
    );
    return search(text, contents);
  };
  // in whole once its manifest is there, and searchable once a search sees
  // it (realtime: false): a get finds it before the refresh does
  const upload = async (name: string, content: string) => {
    await hub.file({ externalId: name, name });
    await hub.content(name, Readable.from([content]));
    const id = keyId({
      hash: sha256(content),
      processor: fakeText,
      version: 1,
    });
    await vi.waitFor(
      async () =>
        expect(
          (await opensearch.exists({ index, id, realtime: false })).body,
        ).toBe(true),
      { timeout: 20_000, interval: 200 },
    );
  };

  beforeAll(async () => {
    app = await bootApp({ imports: [FakePluginsModule] });
    hub = portalIngest(app, portal);
    opensearch = app.get(OPENSEARCH);
    await upload('lecture.txt', lecture);
    await upload('elsewhere.txt', elsewhere);
    await upload('book.txt', book);
    for (const [i, sheet] of sheets.entries())
      await upload(`sheet-${i}.txt`, sheet);
    // the reconcile at start may queue the texts other specs left first
  }, 60_000);

  afterAll(() => app.close());
  afterEach(() => vi.restoreAllMocks());

  // a page none of whose words match, found by knn, gets a fragment too
  it('finds a word in any script among the contents named, and pages by their meaning, highlighted as text', async () => {
    const [found] = await search('semafor', [lecture]);

    expect(found.pages.map(({ page }) => page)).toEqual([3, 1, 2]);
    expect(found.pages[2].snippet).toEqual({
      text: 'a page about nothing',
      highlights: [],
    });
  });

  it('finds by the words alone without the embedder, their pages highlighted as text', async () => {
    expect(await byWords('semafor', [lecture])).toEqual([
      {
        hash: sha256(lecture),
        pages: [
          {
            processor: fakeText,
            version: 1,
            page: 3,
            snippet: {
              text: '<script>semafor()</script> camelCaseName',
              highlights: [[8, 15]],
            },
          },
          {
            processor: fakeText,
            version: 1,
            page: 1,
            snippet: {
              text: 'Семафори штите критичну секцију',
              highlights: [[0, 8]],
            },
          },
        ],
      },
    ]);
  });

  // OpenSearch marks its parts (camel, Case, Name) one by one
  // the hybrid query's raw scores come out far outside 0 to 1, a few huge
  // and negative, without the pipeline that normalizes them
  it('scores contents 0 to 1, through the hybrid pipeline', async () => {
    const asked = vi.spyOn(opensearch, 'search');

    expect(await search('mreža', [book, ...sheets, lecture])).not.toEqual([]);

    const [[request]] = asked.mock.calls;
    expect(request).toMatchObject({ search_pipeline: pipeline });
    const { body } = (await asked.mock.results[0].value) as API.Search_Response;
    expect(body.hits.hits).toHaveLength(5);
    for (const { _score } of body.hits.hits)
      expect(_score).toSatisfy((score) => score >= 0 && score <= 1);
  });

  // the text and the vector its own, in a content not named
  it('finds nothing of the contents not named, however well it matches', async () => {
    const found = await search(elsewhere, [lecture, book]);

    expect(found.map(({ hash }) => hash).toSorted()).toEqual(
      [lecture, book].map(sha256).toSorted(),
    );
    expect(await byWords(elsewhere, [lecture, book])).toEqual([
      expect.objectContaining({ hash: sha256(lecture) }),
    ]);
  });

  it('highlights an identifier matched in parts as one', async () => {
    const [{ pages }] = await search('camelCaseName', [lecture]);

    expect(pages[0].snippet.highlights).toEqual([[27, 40]]);
  });

  it('answers a content once however many of its chunks match, with its best three', async () => {
    const found = await search('mreža', [book, ...sheets], 3);

    expect(found).toHaveLength(3);
    expect(new Set(found.map(({ hash }) => hash)).size).toBe(3);
    expect(found[0]).toMatchObject({ hash: sha256(book) });
    expect(found[0].pages).toHaveLength(3);
  });

  it('puts the pipeline back when a search finds it gone, and finds all the same', async () => {
    await opensearch.searchPipeline.delete({ id: pipeline });

    expect(await search('semafor', [lecture])).toEqual([
      expect.objectContaining({ hash: sha256(lecture) }),
    ]);
    expect(
      (await opensearch.searchPipeline.get({ id: pipeline })).body,
    ).toHaveProperty(pipeline);
  });

  it('makes the index and the pipeline again when a search finds them gone, and finds nothing yet', async () => {
    // no job halfway through a text: it would find the index gone midway
    const queue = app.get<Queue>(getQueueToken(SEARCH_INDEX_QUEUE));
    await vi.waitFor(
      async () =>
        expect(
          await queue.getJobCountByTypes('active', 'wait', 'delayed'),
        ).toBe(0),
      { timeout: 20_000, interval: 200 },
    );
    await opensearch.indices.delete({ index });
    await opensearch.searchPipeline.delete({ id: pipeline });

    expect(await search('semafor', [lecture])).toEqual([]);
    expect((await opensearch.indices.exists({ index })).body).toBe(true);
    expect(
      (await opensearch.searchPipeline.get({ id: pipeline })).body,
    ).toHaveProperty(pipeline);
  });
});
