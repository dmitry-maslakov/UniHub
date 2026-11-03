import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { PluginRegistry } from '../src/plugins/plugin-registry.js';
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

  it(
    'runs what a connector sends through processors and aggregators',
    { timeout: 20_000 },
    async () => {
      await app.get(FakeConnector).sync();

      const text = app.get(FakeTextProcessor);
      const feed = app.get(FakeAggregator);
      await vi.waitFor(
        () => {
          expect(text.seen).toEqual(['page one\fpage two']);
          // other test files leave their own messages in the queues
          expect(feed.received).toContainEqual({
            portal: FAKE_PORTAL,
            itemId: expect.any(String),
          });
        },
        { timeout: 15_000, interval: 200 },
      );
      expect(app.get(FakePdfProcessor).seen).not.toContain('notes.txt');
    },
  );
});
