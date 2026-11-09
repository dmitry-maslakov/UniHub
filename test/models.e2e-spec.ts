import { Readable } from 'node:stream';
import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { OutboxRelay } from '@nestjs/outbox';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Queue } from 'bullmq';
import type { PortalIngest } from '@app/plugin-sdk';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { CONNECTORS_QUEUE } from '../src/plugins/infrastructure/connectors.queue.js';
import {
  jobId,
  type PluginJob,
} from '../src/processing/application/plugin-job.js';
import {
  exitCodeFor,
  pendingJobs,
} from '../src/processing/infrastructure/models.pending.js';
import { MODELS_QUEUE } from '../src/processing/infrastructure/models.queue.js';
import { ModelsWorker } from '../src/processing/infrastructure/models.worker.js';
import { PLUGINS_QUEUE } from '../src/processing/infrastructure/plugins.queue.js';
import { SEARCH_INDEX_QUEUE } from '../src/processing/infrastructure/search/search-index.queue.js';
import { PluginName } from '@app/kernel';
import { bootApp, bootModels } from './app.js';
import { testEnv } from './env.js';
import { FakeHeavyProcessor, FakePluginsModule } from './fake-plugins.js';
import { portalIngest } from './ingest.js';
import { sha256 } from './sha256.js';

const QUEUES = [
  CONNECTORS_QUEUE,
  PLUGINS_QUEUE,
  SEARCH_INDEX_QUEUE,
  MODELS_QUEUE,
];
const db = new URL(testEnv.REDIS_URL).pathname.slice(1);

const workers = (app: INestApplicationContext) =>
  Promise.all(
    QUEUES.map(async (name) => {
      const queue = app.get<Queue>(getQueueToken(name));
      return (await queue.getWorkers()).filter((w) => w.db === db).length;
    }),
  );

// The wiring of the heavy processors' queue: a stored content's job lands in
// `models`, no ordinary process reads it, a run of APP_ROLE=models does and
// ends when it's drained. Which queue a job goes to is checked on fakes
// (BullmqPluginJobQueue).
describe('models', { timeout: 30_000 }, () => {
  const content = 'a scan, in words';
  const heavy = {
    kind: 'process',
    key: {
      hash: sha256(content),
      processor: PluginName.parse('fake-heavy'),
      version: 1,
    },
  } as const satisfies PluginJob;
  const plain = {
    kind: 'process',
    key: {
      hash: sha256('plain'),
      processor: PluginName.parse('fake-text'),
      version: 1,
    },
  } as const satisfies PluginJob;
  let app: INestApplication | undefined;
  let run: INestApplicationContext | undefined;
  let hub: PortalIngest;

  beforeAll(async () => {
    app = await bootApp({ imports: [FakePluginsModule] });
    hub = portalIngest(app, 'models-test');
  });

  afterAll(async () => {
    await app?.close();
    await run?.close();
  });

  const modelsQueue = (from: INestApplicationContext) =>
    from.get<Queue<PluginJob>>(getQueueToken(MODELS_QUEUE));

  it('has no work before a heavy content is stored', async () => {
    const pending = await pendingJobs(modelsQueue(app!));

    expect([pending, exitCodeFor(pending)]).toEqual([0, 3]);
  });

  it("queues a heavy content's job in models, which an ordinary worker leaves be", async () => {
    await hub.file({ externalId: 'h', name: 'scan.heavy' });
    await hub.content('h', Readable.from([content]));
    await vi.waitFor(
      async () =>
        expect(await modelsQueue(app!).getJobState(jobId(heavy))).toBe(
          'waiting',
        ),
      { timeout: 10_000, interval: 200 },
    );
    // an ordinary content stored after it is processed, so the workers are up
    await hub.file({ externalId: 't', name: 't.txt' });
    await hub.content('t', Readable.from(['plain']));
    const main = app!.get<Queue<PluginJob>>(getQueueToken(PLUGINS_QUEUE));
    await vi.waitFor(
      async () =>
        expect(await main.getJobState(jobId(plain))).toBe('completed'),
      { timeout: 10_000, interval: 200 },
    );

    expect(await main.getJobState(jobId(heavy))).toBe('unknown');
    expect(await modelsQueue(app!).getJobState(jobId(heavy))).toBe('waiting');
    expect(app!.get(FakeHeavyProcessor).seen).toEqual([]);
    const pending = await pendingJobs(modelsQueue(app!));
    expect([pending, exitCodeFor(pending)]).toEqual([1, 0]);
  });

  it('is drained by a run of the models role, which reads nothing else', async () => {
    await app!.close();
    app = undefined;

    run = await bootModels({ imports: [FakePluginsModule] });
    await vi.waitFor(async () =>
      expect(await workers(run!)).toEqual([0, 0, 0, 1]),
    );
    expect(run.get(OutboxRelay).running).toBe(false);
    const scheduler = run.get(SchedulerRegistry);
    expect([scheduler.getCronJobs().size, scheduler.getTimeouts()]).toEqual([
      0,
      [],
    ]);

    // it ends once the queue is empty
    await expect(run.get(ModelsWorker).drained()).resolves.toBe(true);
    expect(run.get(FakeHeavyProcessor).seen).toEqual([content]);
    const stored = await run.get(PrismaService).representation.findUnique({
      where: { hash_processor_version: heavy.key },
    });
    expect(stored?.parts).toEqual([`read: ${content}`]);
    const pending = await pendingJobs(modelsQueue(run));
    expect([pending, exitCodeFor(pending)]).toEqual([0, 3]);
  });
});
