import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { QueryBus } from '@nestjs/cqrs';
import type { Queue } from 'bullmq';
import type { API, Client } from '@opensearch-project/opensearch';
import type { PortalIngest } from '@app/plugin-sdk';
import { PluginName } from '@app/kernel';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { OPENSEARCH } from '../src/platform/search/opensearch.module.js';
import { IndexText } from '../src/processing/application/index-text.js';
import {
  EmbedderUnavailableError,
  QueryEmbedder,
  Reranker,
  TextIndex,
} from '../src/processing/application/ports.js';
import {
  SearchTextsQuery,
  type SearchScope,
} from '../src/processing/contracts.js';
import {
  keyId,
  type RepresentationKey,
} from '../src/processing/domain/representation.js';
import { SEARCH_INDEX_QUEUE } from '../src/processing/infrastructure/search/search-index.queue.js';
import {
  indexName,
  pipelineName,
} from '../src/processing/infrastructure/search/text-index.mapping.js';
import { bootApp } from './app.js';
import { testEnv, testVectors } from './env.js';
import { FakeEmbedder } from './fake-models.js';
import { FakePluginsModule } from './fake-plugins.js';
import { portalIngest } from './ingest.js';
import { sha256 } from './sha256.js';

// What OpenSearch makes of SearchTextsQuery: the query's bodies, by the
// words and the meaning (FakeEmbedder's) or by the words alone, their
// filter, collapse and highlight, the hybrid pipeline, how the answer is
// read back, and what of it the reranker gets. Which pages are shown of the
// chunks it answers, and the bodies' parts, are checked on their own
// (text-index.search.spec.ts), the rest of the query on fakes (SearchTexts).

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

  const search = (
    text: string,
    contents: string[],
    limit = 10,
    records: Partial<SearchScope> = {},
  ) =>
    app.get(QueryBus).execute(
      new SearchTextsQuery(
        text,
        {
          contents: contents.map(sha256),
          posts: [],
          files: [],
          archives: [],
          ...records,
        },
        limit,
      ),
    );
  // as when the query embedder is away: by the words alone
  const byWords = (
    text: string,
    contents: string[],
    records: Partial<SearchScope> = {},
  ) => {
    vi.spyOn(app.get(QueryEmbedder), 'embed').mockRejectedValueOnce(
      new EmbedderUnavailableError('embedder.invalid: ENOTFOUND'),
    );
    return search(text, contents, 10, records);
  };
  // in whole once its manifest is there, and searchable once a search sees
  // it (realtime: false): a get finds it before the refresh does
  const searchable = (key: RepresentationKey) =>
    vi.waitFor(
      async () =>
        expect(
          (await opensearch.exists({ index, id: keyId(key), realtime: false }))
            .body,
        ).toBe(true),
      { timeout: 20_000, interval: 200 },
    );
  const upload = async (name: string, content: string) => {
    await hub.file({ externalId: name, name });
    await hub.content(name, Readable.from([content]));
    await searchable({
      hash: sha256(content),
      processor: fakeText,
      version: 1,
    });
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
        records: [],
      },
    ]);
  });

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

  // its words only in the text of a processor that's off, still indexed
  it('finds nothing in the text of a processor that is off, by the words or the meaning', async () => {
    const off = {
      hash: sha256(lecture),
      processor: PluginName.parse('zz-off'),
      version: 1,
    };
    await app.get(PrismaService).representation.create({
      data: { ...off, parts: ['kvantna mehanika'] },
    });
    await app.get(IndexText).run(off);
    await searchable(off);

    expect(await byWords('kvantna', [lecture])).toEqual([]);
    // knn always has nearest ones: the lecture, by fake-text's pages alone
    const [{ pages }] = await search('kvantna', [lecture]);
    expect(new Set(pages.map(({ processor }) => processor))).toEqual(
      new Set([fakeText]),
    );
  });

  // as IndexRecord writes them: a name by the content it names, a post by
  // its own text's hash, with its vector
  it("finds records only of the ids named, a name by its words with its content's pages, a post by its meaning too", async () => {
    const records = app.get(TextIndex);
    const post = 'Kolokvijum iz niti u petak';
    const [vector] = await new FakeEmbedder(testVectors.dimensions).embed([
      post,
    ]);
    await records.putRecord({ kind: 'file', id: 'named', fingerprint: 'a' }, [
      { hash: sha256(lecture), text: 'raspored-semafora.txt' },
    ]);
    await records.putRecord({ kind: 'post', id: 'post', fingerprint: 'b' }, [
      { hash: sha256(post), text: post, vector },
    ]);
    // written the first time, searchable after the next refresh
    for (const id of ['file__named', 'post__post'])
      await vi.waitFor(
        async () =>
          expect(
            (await opensearch.exists({ index, id, realtime: false })).body,
          ).toBe(true),
        { timeout: 20_000, interval: 200 },
      );

    // the lecture's pages and its name, in one hit
    const [both, ...none] = await byWords('raspored semafor', [lecture], {
      files: ['named'],
    });
    expect(none).toEqual([]);
    expect(both).toMatchObject({
      hash: sha256(lecture),
      pages: [expect.objectContaining({ page: 3 }), expect.anything()],
      records: [
        {
          kind: 'file',
          record: 'named',
          member: null,
          snippet: {
            text: 'raspored-semafora.txt',
            highlights: [[0, 8]],
          },
        },
      ],
    });
    // nor a name of a file not named, nor one by meaning alone: knn finds
    // the post, never the name
    expect(await byWords('raspored', [lecture])).toEqual([]);
    expect(
      await search('kvantna mehanika', [], 10, {
        files: ['named'],
        posts: ['post'],
      }),
    ).toEqual([
      {
        hash: sha256(post),
        pages: [],
        records: [expect.objectContaining({ kind: 'post', record: 'post' })],
      },
    ]);
    expect(await search(post, [elsewhere], 10, { posts: ['other'] })).toEqual([
      expect.objectContaining({ hash: sha256(elsewhere), records: [] }),
    ]);
  });

  // OpenSearch marks its parts (camel, Case, Name) one by one
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

  // in what order it puts them is SearchTexts' own (search-texts.spec.ts)
  it('has the reranker reorder the contents found, by their best snippets', async () => {
    const scores = vi.spyOn(app.get(Reranker), 'scores');
    // busy, as bootApp's is: in the index's order
    const found = await search('mreža', [book, ...sheets]);
    // the index's best last
    scores.mockImplementationOnce(async (_, texts) => texts.map((_, i) => i));

    expect(await search('mreža', [book, ...sheets])).toEqual(
      found.toReversed(),
    );
    expect(found).toHaveLength(4);
    expect(scores).toHaveBeenLastCalledWith(
      'mreža',
      found.map(({ pages }) => pages[0].snippet.text),
    );
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
