import { setTimeout as sleep } from 'node:timers/promises';
import { Outbox, OutboxDeadLetters } from '@nestjs/outbox';
import { CommandBus } from '@nestjs/cqrs';
import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { HubReader, ITEM_INGESTED, ITEM_REMOVED } from '@app/plugin-sdk';
import { PortalId } from '@app/kernel';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { ITEM_CHANGED } from '../src/catalog/contracts.js';
import { Connection } from '../src/ingest/contracts.js';
import {
  PluginCatalog,
  SyncConnectionCommand,
} from '../src/plugins/contracts.js';
import { PollSchedule } from '../src/plugins/application/poll-schedule.js';
import { CONNECTORS_QUEUE } from '../src/plugins/infrastructure/connectors.queue.js';
import { PluginsOutboxTransport } from '../src/processing/contracts.js';
import { PLUGINS_QUEUE } from '../src/processing/infrastructure/plugins.queue.js';
import { bootApp } from './app.js';
import {
  FAKE_PORTAL,
  FakeAggregator,
  FakePdfProcessor,
  FakePluginsModule,
  FakePollConnector,
  FakePushConnector,
  FakeTextProcessor,
  FlakyAggregator,
} from './fake-plugins.js';

// other test files leave their own messages in the queues, so checks here look
// only at the fake portal
const forFakePortal = <T extends { payload: { portal: string } }>(
  messages: T[],
) => messages.filter((m) => m.payload.portal === FAKE_PORTAL);

describe('plugins', { timeout: 20_000 }, () => {
  let app: INestApplication;
  let itemId: string;

  beforeAll(async () => {
    app = await bootApp({ imports: [FakePluginsModule] });
  });

  afterAll(() => app.close());

  // what "sync now" from a client sends
  const syncNow = () =>
    app
      .get(CommandBus)
      .execute(
        new SyncConnectionCommand(
          Connection.shared(PortalId.parse(FAKE_PORTAL)),
        ),
      );

  it('polls a connector and runs the result through processors and aggregators', async () => {
    await syncNow();

    const feed = app.get(FakeAggregator);
    await vi.waitFor(
      () => {
        expect(app.get(FakeTextProcessor).seen).toEqual(['page one\fpage two']);
        expect(forFakePortal(feed.received)).toEqual([
          { topic: ITEM_INGESTED, payload: expect.anything() },
        ]);
      },
      { timeout: 10_000, interval: 200 },
    );
    expect(app.get(FakePollConnector).ctx?.connection).toEqual({
      portal: FAKE_PORTAL,
      account: 'shared',
    });
    expect(app.get(FakePdfProcessor).seen).not.toContain('notes.txt');
    itemId = feed.received.at(-1)!.payload.itemId;
  });

  it('never runs two polls of one connection at once', async () => {
    const connector = app.get(FakePollConnector);
    const before = connector.polls;
    connector.delayMs = 1_000;

    await syncNow();
    await syncNow();
    await syncNow();
    await sleep(2_500);

    connector.delayMs = 0;
    expect(connector.polls).toBe(before + 1);
  });

  it('schedules poll connectors and drops schedules of turned-off ones', async () => {
    const queue = app.get<Queue>(getQueueToken(CONNECTORS_QUEUE));
    await queue.upsertJobScheduler('gone__shared', { pattern: '0 0 1 1 *' });

    await app.get(PollSchedule).apply();

    const keys = (await queue.getJobSchedulers()).map((s) => s.key);
    expect(keys).toContain(`${FAKE_PORTAL}__shared`);
    expect(keys).not.toContain('gone__shared');
  });

  it('runs push connectors, once per connection', async () => {
    await vi.waitFor(() =>
      expect(app.get(FakePushConnector).running).toEqual(['shared']),
    );
  });

  it('lets aggregators read what a message is about', async () => {
    const item = await app.get(HubReader).item(itemId);
    expect(item).toMatchObject({
      portal: FAKE_PORTAL,
      externalId: 'i1',
      title: 'Notes are up',
      portalCourseId: expect.any(String),
      removed: false,
    });
  });

  it('retries a failing plugin without running the others again', async () => {
    const flaky = app.get(FlakyAggregator);
    // the first attempt failed, the retry comes after the backoff
    await vi.waitFor(
      () => expect(forFakePortal(flaky.received)).toHaveLength(1),
      { timeout: 15_000, interval: 500 },
    );
    expect(forFakePortal(app.get(FakeAggregator).received)).toHaveLength(1);
  }, 20_000);

  it('tells aggregators about removed items', async () => {
    const { ingest } = app.get(FakePollConnector).ctx!;
    expect(await ingest.removeItem('i1')).toEqual({ changed: true });

    await vi.waitFor(
      () =>
        expect(
          forFakePortal(app.get(FakeAggregator).received).map((m) => m.topic),
        ).toEqual([ITEM_INGESTED, ITEM_REMOVED]),
      { timeout: 10_000, interval: 200 },
    );
    expect(await app.get(HubReader).item(itemId)).toMatchObject({
      removed: true,
    });
  });

  it("doesn't queue a message twice when the relay publishes it again", async () => {
    const transport = app.get(PluginsOutboxTransport, { strict: false });
    const message = {
      id: 'same-message',
      topic: ITEM_CHANGED,
      payload: { portal: 'replay-test', itemId: 'x' },
    };

    await transport.publish(message as never);
    await transport.publish(message as never);

    const jobs = (await app.get<Queue>(getQueueToken(PLUGINS_QUEUE)).getJobs())
      .filter((job) => job.id?.startsWith('same-message__'))
      .map((job) => job.name);
    expect(jobs.sort()).toEqual(['fake-feed', 'flaky-feed']);
  });

  it('dead-letters a topic nothing maps at once, a bug rather than an outage', async () => {
    const topic = 'catalog.nobody-maps-this';
    const outbox = app.get(Outbox);
    const message = await app
      .get(PrismaService)
      .$transaction(async (tx) => outbox.add(tx, { topic, payload: {} }));
    outbox.notify();

    await vi.waitFor(
      async () => {
        const letters = await app.get(OutboxDeadLetters).list({ topic });
        expect(letters.find((l) => l.id === message.id)).toMatchObject({
          reason: 'rejected',
          attempts: 1,
        });
      },
      { timeout: 10_000, interval: 200 },
    );
  });

  it('finds the plugins by their decorators', () => {
    const catalog = app.get(PluginCatalog);
    expect(
      [...catalog.pollConnectors, ...catalog.pushConnectors].map(
        (c) => c.spec.portal,
      ),
    ).toEqual(expect.arrayContaining([FAKE_PORTAL, 'fake-push']));
    expect(
      catalog
        .processorsFor({ name: 'slides.PDF', mime: null })
        .map(({ processor, matched }) => [processor.spec.name, matched]),
    ).toEqual([['fake-pdf', '.pdf']]);
  });
});
