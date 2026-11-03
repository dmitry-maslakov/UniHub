import { Test, type TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { HubReader, ITEM_INGESTED, ITEM_REMOVED } from '@app/plugin-sdk';
import { AppModule } from '../src/app.module.js';
import { PluginRegistry } from '../src/plugins/plugin-registry.js';
import { BullMqTransport } from '../src/processing/infrastructure/bullmq.transport.js';
import { PLUGINS_QUEUE } from '../src/processing/queues.js';
import { ITEM_CHANGED } from '../src/catalog/contracts.js';
import {
  FAKE_PORTAL,
  FakeAggregator,
  FakeConnector,
  FakePdfProcessor,
  FakePluginsModule,
  FakeTextProcessor,
  FlakyAggregator,
} from './fake-plugins.js';

// other test files leave their own messages in the queue, so checks here look
// only at the fake portal
const forFakePortal = <T extends { payload: { portal: string } }>(
  messages: T[],
) => messages.filter((m) => m.payload.portal === FAKE_PORTAL);

describe('plugins', () => {
  let app: TestingModule;
  let itemId: string;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [AppModule, FakePluginsModule],
    }).compile();
    await app.init();
  });

  afterAll(() => app.close());

  it('runs a sync through processors and aggregators', async () => {
    await app.get(FakeConnector).sync();

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
    expect(app.get(FakePdfProcessor).seen).not.toContain('notes.txt');
    itemId = (feed.received.at(-1)!.payload as { itemId: string }).itemId;
  });

  it('lets aggregators read what a message is about', async () => {
    const item = await app.get(HubReader).item(itemId);
    expect(item).toMatchObject({
      portal: FAKE_PORTAL,
      externalId: 'i1',
      title: 'Notes are up',
      courseId: expect.any(String),
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
    const { changed } = await app.get(FakeConnector).remove('i1');
    expect(changed).toBe(true);

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
    const transport = app.get(BullMqTransport, { strict: false });
    const message = {
      id: 'same-message',
      topic: ITEM_CHANGED,
      payload: { portal: 'replay-test', itemId: 'x' },
    };

    await transport.publish(message as never);
    await transport.publish(message as never);

    const jobs = await app.get<Queue>(getQueueToken(PLUGINS_QUEUE)).getJobs();
    expect(
      jobs
        .filter((job) => job.id?.startsWith('same-message__'))
        .map((j) => j.name),
    ).toEqual(expect.arrayContaining(['fake-feed', 'flaky-feed']));
    expect(
      jobs.filter((job) => job.id?.startsWith('same-message__')),
    ).toHaveLength(2);
  });

  it('finds the plugins by their decorators', () => {
    const registry = app.get(PluginRegistry);
    expect(registry.connectors.map((c) => c.options)).toContainEqual({
      portal: FAKE_PORTAL,
    });
    expect(
      registry
        .processorsFor({ name: 'slides.PDF', mime: null })
        .map((p) => p.options.name),
    ).toEqual(['fake-pdf']);
  });
});
