import type { ConfigType } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { ConnectorContext } from '@app/plugin-sdk';
import type { IngestService } from '../../ingest/contracts.js';
import { ConnectionDirectory } from '../application/connection-directory.js';
import type { ConnectorSchedules } from '../application/connector-schedules.js';
import { catalogOf, poll } from '../application/plugins.fakes.js';
import type { pluginsConfig } from '../plugins.config.js';
import { POLL, TICK, type ConnectorJob } from './connectors.queue.js';
import { ConnectorsWorker } from './connectors.worker.js';

const job = (name: string, portal = 'acs') =>
  ({ name, data: { portal, account: 'shared' } }) as Job<ConnectorJob>;

function worker(polled: (ctx: ConnectorContext) => Promise<void>) {
  const pollNow = vi.fn(async () => {});
  const config = { pollTimeoutMs: 50 } as ConfigType<typeof pluginsConfig>;
  const w = new ConnectorsWorker(
    catalogOf({ polls: [poll('acs', { poll: polled })] }),
    new ConnectionDirectory({} as IngestService),
    { pollNow } as unknown as ConnectorSchedules,
    config,
  );
  return { w, pollNow };
}

describe('ConnectorsWorker', () => {
  it('turns a tick into a poll of its connection', async () => {
    const { w, pollNow } = worker(async () => {});
    await w.process(job(TICK));
    expect(pollNow).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'acs__shared' }),
    );
  });

  it('polls the connection with a signal of its own', async () => {
    const seen: ConnectorContext[] = [];
    const { w } = worker(async (ctx) => void seen.push(ctx));

    await w.process(job(POLL), 'token', new AbortController().signal);
    await w.process(job(POLL, 'gone'));

    expect(seen.map((ctx) => [ctx.connection, ctx.signal.aborted])).toEqual([
      [{ portal: 'acs', account: 'shared' }, false],
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
});
