import { Test, type TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { AppModule } from '../src/app.module.js';
import { PluginRegistry } from '../src/plugins/plugin-registry.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FILES_QUEUE, ITEMS_QUEUE } from '../src/processing/queues.js';
import {
  FAKE_PORTAL,
  FakeAggregator,
  FakeConnector,
  FakePdfProcessor,
  FakePluginsModule,
  FakeTextProcessor,
} from './fake-plugins.js';

describe('plugins', () => {
  let app: TestingModule;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [AppModule, FakePluginsModule],
    }).compile();
    await app.init();

    const prisma = app.get(PrismaService);
    const where = { portal: FAKE_PORTAL };
    await prisma.file.deleteMany({ where });
    await prisma.item.deleteMany({ where });
    await prisma.portalCourse.deleteMany({ where });
    await prisma.syncState.deleteMany({ where });
    for (const name of [FILES_QUEUE, ITEMS_QUEUE])
      await app.get<Queue>(getQueueToken(name)).obliterate({ force: true });
  });

  afterAll(() => app.close());

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

  it('runs what a connector sends through processors and aggregators', async () => {
    await app.get(FakeConnector).sync();

    const text = app.get(FakeTextProcessor);
    const feed = app.get(FakeAggregator);
    await vi.waitFor(
      () => {
        expect(text.seen).toEqual(['page one\fpage two']);
        expect(feed.received).toEqual([
          { portal: FAKE_PORTAL, itemId: expect.any(String) },
        ]);
      },
      { timeout: 10_000, interval: 200 },
    );
    expect(app.get(FakePdfProcessor).calls).toBe(0);
  });
});
