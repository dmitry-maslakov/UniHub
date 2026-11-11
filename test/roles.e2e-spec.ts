import { once } from 'node:events';
import { connect } from 'node:net';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { CommandBus } from '@nestjs/cqrs';
import { getQueueToken } from '@nestjs/bullmq';
import { OutboxRelay } from '@nestjs/outbox';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { ITEM_INGESTED } from '@app/plugin-sdk';
import { PortalId } from '@app/kernel';
import { Connection } from '../src/ingest/contracts.js';
import { SyncConnectionCommand } from '../src/plugins/contracts.js';
import { CONNECTORS_QUEUE } from '../src/plugins/infrastructure/connectors.queue.js';
import { ConnectorsWorker } from '../src/plugins/infrastructure/connectors.worker.js';
import { PLUGINS_QUEUE } from '../src/processing/infrastructure/plugins.queue.js';
import { SEARCH_INDEX_QUEUE } from '../src/processing/infrastructure/search/search-index.queue.js';
import { bootApp, bootWorker } from './app.js';
import { testEnv } from './env.js';
import {
  FAKE_PORTAL,
  FakeAggregator,
  FakePluginsModule,
  FakePollConnector,
  FakePushConnector,
} from './fake-plugins.js';
import { portalIngest } from './ingest.js';

const QUEUES = [CONNECTORS_QUEUE, PLUGINS_QUEUE, SEARCH_INDEX_QUEUE];
// the e2e redis db: a developer's own app may share the server
const db = new URL(testEnv.REDIS_URL).pathname.slice(1);

// how many workers BullMQ lists for each queue (README's way to tell a
// worker is alive)
const workers = (app: INestApplicationContext) =>
  Promise.all(
    QUEUES.map(async (name) => {
      const queue = app.get<Queue>(getQueueToken(name));
      return (await queue.getWorkers()).filter((w) => w.db === db).length;
    }),
  );

// what the scheduler holds: crons and what runs once the app is up
const scheduled = (app: INestApplicationContext) => {
  const scheduler = app.get(SchedulerRegistry);
  return {
    crons: [...scheduler.getCronJobs().keys()].sort(),
    timeouts: scheduler.getTimeouts().sort(),
  };
};

// APP_ROLE's wiring: an api process serves and only adds work, a worker does
// it with no server of its own. All of it in one, the default, is what every
// other spec boots.
describe('roles', () => {
  const connection = Connection.shared(PortalId.parse(FAKE_PORTAL));
  const portal = 'roles-test';
  let api: INestApplication | undefined;
  let worker: INestApplicationContext | undefined;

  afterAll(async () => {
    await api?.close();
    await worker?.close();
  });

  it('an api process adds work that only a worker does, which serves nothing', async () => {
    api = await bootApp({ role: 'api', imports: [FakePluginsModule] });
    await request(api.getHttpServer()).get('/api/health').expect(200);

    // "sync now", and an item ingested, as gRPC would: a job and a message
    await api.get(CommandBus).execute(new SyncConnectionCommand(connection));
    await portalIngest(api, portal).item({
      externalId: 'r',
      kind: 'post',
      raw: {},
    });
    const connectors = api.get<Queue>(getQueueToken(CONNECTORS_QUEUE));
    const poll = (await connectors.getDeduplicationJobId(connection.key))!;
    expect(await connectors.getJobState(poll)).toBe('waiting');

    // nothing here takes them: no workers, no relay, nothing scheduled
    expect(await workers(api)).toEqual([0, 0, 0]);
    expect(() => api!.get(ConnectorsWorker).worker).toThrow();
    expect(api.get(OutboxRelay).running).toBe(false);
    expect(scheduled(api)).toEqual({ crons: [], timeouts: [] });
    await api.close();
    api = undefined;

    worker = await bootWorker({ imports: [FakePluginsModule] });
    await vi.waitFor(async () =>
      expect(await workers(worker!)).toEqual([1, 1, 1]),
    );
    expect(scheduled(worker)).toEqual({
      crons: ['outbox-retention', 'reconcile', 'reconcile-index'],
      timeouts: [
        'adopt-instances',
        'poll-schedule',
        'push-connections',
        'reconcile-at-start',
        'reconcile-index-at-start',
      ],
    });

    // the api's poll, and its message published by the worker's relay
    const queue = worker.get<Queue>(getQueueToken(CONNECTORS_QUEUE));
    await vi.waitFor(
      async () => expect(await queue.getJobState(poll)).toBe('completed'),
      { timeout: 10_000, interval: 200 },
    );
    expect(worker.get(FakePollConnector).polls).toBe(1);
    await vi.waitFor(
      () =>
        expect(
          worker!
            .get(FakeAggregator)
            .received.filter((m) => m.payload.portal === portal),
        ).toEqual([{ topic: ITEM_INGESTED, payload: expect.anything() }]),
      { timeout: 10_000, interval: 200 },
    );
    await vi.waitFor(() =>
      expect(worker!.get(FakePushConnector).running).toEqual(['shared']),
    );

    expect(worker.get(HttpAdapterHost).httpAdapter).toBeUndefined();
    const [host, port] = testEnv.GRPC_URL.split(':');
    await expect(once(connect(Number(port), host), 'connect')).rejects.toThrow(
      'ECONNREFUSED',
    );
  }, 30_000);
});
