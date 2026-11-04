import { once } from 'node:events';
import type { ConfigType } from '@nestjs/config';
import type { ConnectorContext, PushesFromPortal } from '@app/plugin-sdk';
import type { IngestService } from '../../ingest/contracts.js';
import type { pluginsConfig } from '../plugins.config.js';
import { ConnectionDirectory } from './connection-directory.js';
import { catalogOf, push } from './plugins.fakes.js';
import { PushConnections } from './push-connections.js';

const config: ConfigType<typeof pluginsConfig> = {
  enabled: [],
  runConnectors: true,
  pollTimeoutMs: 60_000,
  stopTimeoutMs: 100,
  restartMaxMs: 5,
};

const untilStopped = async (ctx: ConnectorContext) => {
  await once(ctx.signal, 'abort');
};
const never = () => new Promise<void>(() => {});

function connections(
  connectors: Record<string, PushesFromPortal>,
  settings = config,
) {
  const catalog = catalogOf({
    pushes: Object.entries(connectors).map(([portal, c]) => push(portal, c)),
  });
  const directory = new ConnectionDirectory({} as IngestService);
  return new PushConnections(catalog, directory, settings);
}

describe('PushConnections', () => {
  it('runs each connector for its connection until stopped', async () => {
    const seen: ConnectorContext[] = [];
    const running = connections({
      teams: { run: (ctx) => (seen.push(ctx), untilStopped(ctx)) },
    });

    running.onApplicationBootstrap();
    expect(seen.map((ctx) => ctx.connection)).toEqual([
      { portal: 'teams', account: 'shared' },
    ]);
    expect(seen[0].signal.aborted).toBe(false);

    await running.onModuleDestroy();
    expect(seen[0].signal.aborted).toBe(true);
  });

  it('runs none on an instance without RUN_CONNECTORS', () => {
    const run = vi.fn(never);
    connections(
      { teams: { run } },
      { ...config, runConnectors: false },
    ).onApplicationBootstrap();
    expect(run).not.toHaveBeenCalled();
  });

  it('runs a connector again when it fails or ends, until stopped', async () => {
    let runs = 0;
    const running = connections({
      teams: {
        run: async (ctx) => {
          runs++;
          if (runs === 1) throw new Error('connection refused');
          if (runs === 2) return;
          await untilStopped(ctx);
        },
      },
    });

    running.onApplicationBootstrap();
    await vi.waitFor(() => expect(runs).toBe(3));
    await running.onModuleDestroy();
    expect(runs).toBe(3);
  });

  it('stops them all at once, not waiting past its time for any', async () => {
    const stopped = vi.fn();
    const running = connections({
      a: { run: never },
      b: { run: never },
      c: { run: never },
      d: { run: (ctx) => untilStopped(ctx).then(stopped) },
    });
    running.onApplicationBootstrap();

    const started = performance.now();
    await running.onModuleDestroy();

    // one after another, the three that never stop would take 300 ms
    expect(performance.now() - started).toBeLessThan(250);
    expect(stopped).toHaveBeenCalled();
  });
});
