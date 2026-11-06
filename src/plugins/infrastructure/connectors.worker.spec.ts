import { Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { ConnectorContext } from '@app/plugin-sdk';
import { catalogOf, poll } from '../../../test/discovered-plugins.js';
import type { IngestService } from '../../ingest/contracts.js';
import { roleSettings } from '../../platform/role/role.config.js';
import { ConnectionDirectory } from '../application/connection-directory.js';
import type { ConnectorRuns } from '../application/connector-runs.js';
import type { ConnectorSchedules } from '../application/connector-schedules.js';
import type { pluginsConfig } from '../plugins.config.js';
import { POLL, TICK, type ConnectorJob } from './connectors.queue.js';
import { ConnectorsWorker } from './connectors.worker.js';

const job = (name: string, portal = 'moodle') =>
  ({ name, data: { portal, account: 'shared' } }) as Job<ConnectorJob>;

// in a process of `role`, which runs the workers unless it's an api one
function worker(
  polled: (ctx: ConnectorContext) => Promise<void>,
  role = 'all',
) {
  const pollNow = vi.fn(async () => {});
  const runs = { ended: vi.fn() } satisfies ConnectorRuns;
  const config = { pollTimeoutMs: 50 } as ConfigType<typeof pluginsConfig>;
  const settings = roleSettings.parse({ APP_ROLE: role });
  const w = new ConnectorsWorker(
    catalogOf({ polls: [poll('moodle', { poll: polled })] }),
    new ConnectionDirectory({} as IngestService),
    { pollNow } as unknown as ConnectorSchedules,
    config,
    settings,
    runs,
  );
  // the BullMQ worker Nest would have made for it
  const close = vi.fn(async () => {});
  if (settings.worker) Object.defineProperty(w, 'worker', { value: { close } });
  return { w, pollNow, close, runs };
}

describe('ConnectorsWorker', () => {
  it('turns a tick into a poll of its connection', async () => {
    const { w, pollNow } = worker(async () => {});
    await w.process(job(TICK));
    expect(pollNow).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'moodle__shared' }),
    );
  });

  it('polls the connection with a signal of its own', async () => {
    const seen: ConnectorContext[] = [];
    const { w } = worker(async (ctx) => void seen.push(ctx));

    expect(
      await w.process(job(POLL), 'token', new AbortController().signal),
    ).toBe(true);
    // turned off since: no poll
    expect(await w.process(job(POLL, 'gone'))).toBe(false);

    expect(seen.map((ctx) => [ctx.connection, ctx.signal.aborted])).toEqual([
      [{ portal: 'moodle', account: 'shared' }, false],
    ]);
  });

  it("lets go of a poll past its time, even one that doesn't listen", async () => {
    const { w } = worker(() => new Promise(() => {}));
    await expect(w.process(job(POLL))).rejects.toThrow(/poll stopped/);
  });

  it('stops a poll whose job was cancelled', async () => {
    let signal: AbortSignal | undefined;
    const { w } = worker((ctx) => {
      signal = ctx.signal;
      return new Promise(() => {});
    });
    const cancel = new AbortController();

    const run = w.process(job(POLL), 'token', cancel.signal);
    cancel.abort('its lock was lost');

    await expect(run).rejects.toThrow('poll stopped: its lock was lost');
    expect(signal?.aborted).toBe(true);
  });

  it('lets go of its polls at shutdown and starts none after', async () => {
    // one that doesn't listen to its signal
    const polled = vi.fn(() => new Promise<void>(() => {}));
    const { w, close } = worker(polled);
    const running = w.process(job(POLL), 'token', new AbortController().signal);

    await w.onModuleDestroy();

    await expect(running).rejects.toThrow('the app is shutting down');
    // one BullMQ fetched before it was closed
    await expect(w.process(job(POLL))).rejects.toThrow(/poll stopped/);
    expect(polled).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalled();
  });

  it('counts the polls that succeeded and failed, by portal, but not the ticks', () => {
    const { w, runs } = worker(async () => {});
    const error = vi.spyOn(Logger.prototype, 'error').mockReturnValue();

    w.completed(job(POLL), true);
    w.completed(job(TICK), undefined);
    w.failed(job(POLL, 'canvas'), new Error('canvas token expired'));
    w.failed(job(TICK), new Error('redis is away'));
    w.failed(undefined, new Error('a job gone meanwhile'));

    expect(runs.ended.mock.calls).toEqual([
      ['moodle', 'succeeded'],
      ['canvas', 'failed'],
    ]);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('counts neither a poll whose connector was turned off nor one stopped at shutdown', async () => {
    const { w, runs } = worker(async () => {});
    const error = vi.spyOn(Logger.prototype, 'error').mockReturnValue();

    w.completed(job(POLL, 'gone'), await w.process(job(POLL, 'gone')));
    await w.onModuleDestroy();
    w.failed(job(POLL), new Error('poll stopped: the app is shutting down'));

    expect(runs.ended).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('has no worker to close in an api process, which registers none', async () => {
    const { w } = worker(async () => {}, 'api');
    await expect(w.onModuleDestroy()).resolves.toBeUndefined();
  });
});
