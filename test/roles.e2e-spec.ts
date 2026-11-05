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
import {
  CONNECTORS_QUEUE,
  type ConnectorJob,
} from '../src/plugins/infrastructure/connectors.queue.js';
import { ConnectorsWorker } from '../src/plugins/infrastructure/connectors.worker.js';
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

// APP_ROLE's wiring: an api process serves and only adds work, a worker does
// it with no server of its own. All of it in one, the default, is what every
// other spec boots.
describe('roles', { timeout: 20_000 }, () => {
  const connection = Connection.shared(PortalId.parse(FAKE_PORTAL));
  const portal = 'roles-test';
  let api: INestApplication | undefined;
  let worker: INestApplicationContext | undefined;
  let poll: string;

  afterAll(async () => {
    await api?.close();
    await worker?.close();
  });

  it('an api process serves and adds work, but does none', async () => {
    api = await bootApp({ role: 'api', imports: [FakePluginsModule] });
    await request(api.getHttpServer()).get('/api/health').expect(200);

    // "sync now", and an item ingested, as gRPC would: a job and a message
    await api.get(CommandBus).execute(new SyncConnectionCommand(connection));
    await portalIngest(api, portal).item({
      externalId: 'r',
      kind: 'post',
      raw: {},
    });

    const queue = api.get<Queue<ConnectorJob>>(getQueueToken(CONNECTORS_QUEUE));
    poll = (await queue.getDeduplicationJobId(connection.key))!;
    expect(await queue.getJobState(poll)).toBe('waiting');
    // nothing here takes them: no workers, no relay, nothing scheduled
    expect(() => api!.get(ConnectorsWorker).worker).toThrow();
    expect(api.get(OutboxRelay).running).toBe(false);
    const scheduler = api.get(SchedulerRegistry);
    expect([...scheduler.getCronJobs().keys()]).toEqual([]);
    expect(scheduler.getTimeouts()).toEqual([]);

    await api.close();
    api = undefined;
  });

  it('a worker does that work, serving nothing', async () => {
    worker = await bootWorker({ imports: [FakePluginsModule] });

    const queue = worker.get<Queue<ConnectorJob>>(
      getQueueToken(CONNECTORS_QUEUE),
    );
    await vi.waitFor(
      async () => expect(await queue.getJobState(poll)).toBe('completed'),
      { timeout: 10_000, interval: 200 },
    );
    expect(worker.get(FakePollConnector).polls).toBe(1);
    // the api's message, published by the worker's relay
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
  });
});
