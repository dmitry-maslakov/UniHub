import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { NO_INSTANCE, PortalId } from '@app/kernel';
import {
  CourseName,
  CreateCourseCommand,
  LinkPortalCourseCommand,
  Slug,
} from '../src/catalog/contracts.js';
import type { Mail } from '../src/identity/domain/mailer.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { TextIndexQueue } from '../src/processing/application/ports.js';
import { SearchTextsQuery } from '../src/processing/contracts.js';
import { SEARCH_INDEX_QUEUE } from '../src/processing/infrastructure/search/search-index.queue.js';
import { accounts } from './accounts.js';
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
  const mails: Mail[] = [];
  const { http, post, signUp, makeAdmin } = accounts(() => app, mails);
  const get = (path: string, cookie: string) =>
    http().get(path).set('cookie', cookie);

  beforeAll(async () => {
    app = await bootApp({ mails, imports: [FakePluginsModule] });
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

  it('lists no search-index queue to admins', async () => {
    const admin = await signUp('queues@search.test');
    await makeAdmin('queues@search.test');
    const { body } = await get('/api/admin/queues', admin).expect(200);
    const names = body.map(({ name }: { name: string }) => name);
    expect(names).toEqual(expect.arrayContaining(['plugins', 'models']));
    expect(names).not.toContain('search-index');
  });

  // its handler is processing's, there with search off too
  it('tells a search that search is off', async () => {
    await expect(
      app.get(QueryBus).execute(
        new SearchTextsQuery(
          'semafor',
          {
            contents: [sha256('a')],
            posts: [],
            files: [],
            archives: [],
          },
          10,
        ),
      ),
    ).rejects.toMatchObject({ kind: 'unavailable', reason: 'SEARCH_OFF' });
  });

  // HTML is read to plain text by the processing module, not by search's
  it("answers a post's text", async () => {
    const hub = portalIngest(app, 'search-off-post');
    await hub.course({ externalId: 'c1', name: 'Course' });
    await hub.item({
      externalId: 'p1',
      course: 'c1',
      kind: 'announcement',
      title: 'Exam',
      raw: { message: '<p>On <b>Monday</b></p>' },
    });
    const commands = app.get(CommandBus);
    await commands.execute(
      new CreateCourseCommand(Slug.parse('off'), CourseName.parse('Off')),
    );
    await commands.execute(
      new LinkPortalCourseCommand(
        Slug.parse('off'),
        {
          portal: PortalId.parse('search-off-post'),
          instance: NO_INSTANCE,
          externalId: 'c1',
        },
        null,
      ),
    );
    const admin = await signUp('reader@search.test');
    await makeAdmin('reader@search.test');
    const [post] = (await get('/api/courses/off/items', admin).expect(200))
      .body;

    const text = await get(`/api/items/${post.id}/text`, admin).expect(200);
    expect(text.body).toEqual({ text: 'On Monday' });
  });

  it('has no search route or tool', async () => {
    const cookie = await signUp('off@search.test');
    const { key } = (
      await post('/api-key/create', { name: 'agent' }, cookie).expect(200)
    ).body as { key: string };

    await http().get('/api/search?q=semafor').set('cookie', cookie).expect(404);
    const tools = await http()
      .post('/api/mcp')
      .set('accept', 'application/json, text/event-stream')
      .set('x-api-key', key)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
      .expect(200);
    expect(
      tools.body.result.tools.map((t: { name: string }) => t.name),
    ).not.toContain('search');
  });
});
