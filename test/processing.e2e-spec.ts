import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { Test, type TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { PortalIngest } from '@app/plugin-sdk';
import { ContentHash, PluginName } from '@app/kernel';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import type { ProcessJob } from '../src/processing/application/plugin-job.js';
import {
  FileFacts,
  PluginJobQueue,
} from '../src/processing/application/ports.js';
import { Reconcile } from '../src/processing/application/reconcile.js';
import { PLUGINS_QUEUE } from '../src/processing/infrastructure/plugins.queue.js';
import { FakePluginsModule, FakeTextProcessor } from './fake-plugins.js';
import { portalIngest } from './ingest.js';

const portal = 'processing-test';
const text = 'the same notes in two courses';
const sha = (content: string) =>
  createHash('sha256').update(content).digest('hex');
const hash = sha(text);

describe('processing', { timeout: 20_000 }, () => {
  let app: TestingModule;
  let hub: PortalIngest;
  let prisma: PrismaService;

  const stored = () =>
    prisma.representation.findUnique({
      where: {
        hash_processor_version: { hash, processor: 'fake-text', version: 1 },
      },
    });

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [AppModule, FakePluginsModule],
    }).compile();
    await app.init();
    hub = portalIngest(app, portal);
    prisma = app.get(PrismaService);
  });

  afterAll(() => app.close());

  it('stores what a processor made of the content', async () => {
    await hub.file({ externalId: 'a', name: 'a.txt' });
    await hub.content('a', Readable.from([text]));

    await vi.waitFor(
      async () => expect((await stored())?.parts).toEqual([text]),
      { timeout: 10_000, interval: 200 },
    );
  });

  it('processes the same content in another file only once', async () => {
    const seen = () =>
      app.get(FakeTextProcessor).seen.filter((t) => t === text).length;
    expect(seen()).toBe(1);

    await hub.file({ externalId: 'b', name: 'b.txt' });
    await hub.content('b', Readable.from([text]));

    // b's job has run by the time it shows up as completed in redis, give it
    // the relay's poll plus a margin
    await new Promise((r) => setTimeout(r, 2_500));
    expect(seen()).toBe(1);
  });

  it('queues processing that went missing', async () => {
    await prisma.representation.delete({
      where: {
        hash_processor_version: { hash, processor: 'fake-text', version: 1 },
      },
    });

    expect(await app.get(Reconcile).run()).toBeGreaterThanOrEqual(1);
    await vi.waitFor(async () => expect(await stored()).not.toBeNull(), {
      timeout: 10_000,
      interval: 200,
    });
  });

  it('takes a removed file for gone, as catalog keeps it', async () => {
    await hub.file({ externalId: 'gone', name: 'gone.txt' });
    await hub.removeFile('gone');
    const { id } = await prisma.file.findUniqueOrThrow({
      where: { portal_externalId: { portal, externalId: 'gone' } },
    });

    expect(await app.get(FileFacts).file(id)).toBeNull();
  });

  it('queues the same processing once, whether a message or a reconcile asks first', async () => {
    const queue = app.get<Queue>(getQueueToken(PLUGINS_QUEUE));
    const jobs = app.get(PluginJobQueue);
    const job = (content: string): ProcessJob => ({
      kind: 'process',
      key: {
        hash: ContentHash.parse(sha(content)),
        processor: PluginName.parse('fake-text'),
        version: 1,
      },
    });
    const sent = job('sent first');
    const reconciled = job('reconciled first');
    const queued = async ({ key }: ProcessJob) =>
      (await queue.getJobs('wait')).filter(
        ({ data }) => data.key?.hash === key.hash,
      ).length;

    // nothing runs before it's counted
    await queue.pause();
    try {
      await jobs.enqueue([sent]);
      await jobs.requeue(sent);
      await jobs.requeue(reconciled);
      await jobs.enqueue([reconciled]);

      expect([await queued(sent), await queued(reconciled)]).toEqual([1, 1]);
    } finally {
      await queue.resume();
    }
  });

  it('queues it again once the last reconcile job for it is done', async () => {
    // that job is kept in redis for a day; it mustn't block the next run.
    // Done means finished in redis too, not just its result saved: its
    // deduplication ends then (other spec files share the queue, so not
    // "no jobs left")
    const queue = app.get<Queue>(getQueueToken(PLUGINS_QUEUE));
    await vi.waitFor(
      async () =>
        expect(
          await queue.getDeduplicationJobId(`${hash}__fake-text__1`),
        ).toBeNull(),
      { timeout: 10_000, interval: 100 },
    );
    await prisma.representation.delete({
      where: {
        hash_processor_version: { hash, processor: 'fake-text', version: 1 },
      },
    });

    await app.get(Reconcile).run();
    await vi.waitFor(async () => expect(await stored()).not.toBeNull(), {
      timeout: 10_000,
      interval: 200,
    });
  });
});
