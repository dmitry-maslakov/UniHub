import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { QueryBus } from '@nestjs/cqrs';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { TextIndexQueue } from '../src/processing/application/ports.js';
import { SearchTextsQuery } from '../src/processing/contracts.js';
import { SEARCH_INDEX_QUEUE } from '../src/processing/infrastructure/search/search-index.queue.js';
import { testEnv } from './env.js';
import { FakePluginsModule } from './fake-plugins.js';
import { portalIngest } from './ingest.js';
import { sha256 } from './sha256.js';

// ConditionalModule reads the environment as the app's modules are
// imported, so search is turned off before they are (and dotenv doesn't set
// a variable that's set already, empty or not).
process.env.OPENSEARCH_URL = '';
const { bootApp } = await import('./app.js');

describe('search off', { timeout: 20_000 }, () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootApp({ imports: [FakePluginsModule] });
  });

  afterAll(async () => {
    await app.close();
    process.env.OPENSEARCH_URL = testEnv.OPENSEARCH_URL;
  });

  it('has no search index queue, and processes content as before', async () => {
    expect(() => app.get(TextIndexQueue)).toThrow();
    expect(() => app.get(getQueueToken(SEARCH_INDEX_QUEUE))).toThrow();
    const content = 'search off: processed all the same';
    const hub = portalIngest(app, 'search-off-test');

    await hub.file({ externalId: 'a', name: 'a.txt' });
    await hub.content('a', Readable.from([content]));

    await vi.waitFor(
      async () =>
        expect(
          await app
            .get(PrismaService)
            .representation.findFirst({ where: { hash: sha256(content) } }),
        ).not.toBeNull(),
      { timeout: 10_000, interval: 200 },
    );
  });

  // its handler is processing's, there with search off too
  it('tells a search that search is off', async () => {
    await expect(
      app
        .get(QueryBus)
        .execute(new SearchTextsQuery('semafor', [sha256('a')], 10)),
    ).rejects.toMatchObject({ kind: 'unavailable', reason: 'SEARCH_OFF' });
  });
});
