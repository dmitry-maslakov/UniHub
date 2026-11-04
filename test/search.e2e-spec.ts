import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { QueryBus } from '@nestjs/cqrs';
import type { Queue } from 'bullmq';
import type { Client } from '@opensearch-project/opensearch';
import type { PortalIngest } from '@app/plugin-sdk';
import { PluginName } from '@app/kernel';
import { OPENSEARCH } from '../src/platform/search/opensearch.module.js';
import { SearchTextsQuery } from '../src/processing/contracts.js';
import { keyId } from '../src/processing/domain/representation.js';
import { SEARCH_INDEX_QUEUE } from '../src/processing/infrastructure/search/search-index.queue.js';
import { indexName } from '../src/processing/infrastructure/search/text-index.mapping.js';
import { bootApp } from './app.js';
import { testEnv } from './env.js';
import { FakePluginsModule } from './fake-plugins.js';
import { portalIngest } from './ingest.js';
import { sha256 } from './sha256.js';

// What OpenSearch makes of SearchTextsQuery: the query's body, its collapse
// and highlight, and how the answer is read back. Which hits it keeps and
// how the pages are shown is checked on fakes (SearchTexts), the body's
// parts on its own (text-index.mapping.spec.ts).

const portal = 'search-test';
const index = indexName(testEnv.OPENSEARCH_INDEX_PREFIX);
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
  // in whole once its manifest is there, and searchable (refresh)
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
        expect((await opensearch.exists({ index, id })).body).toBe(true),
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
  });

  afterAll(() => app.close());

  it('finds a word in any script among the contents named, their pages highlighted as text', async () => {
    expect(await search('semafor', [lecture])).toEqual([
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

  it('makes the index again when a search finds it gone, and finds nothing yet', async () => {
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

    expect(await search('semafor', [lecture])).toEqual([]);
    expect((await opensearch.indices.exists({ index })).body).toBe(true);
  });
});
