import { setImmediate } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { CommandBus } from '@nestjs/cqrs';
import {
  CredentialRejectedError,
  Secret,
  type ConnectorContext,
} from '@app/plugin-sdk';
import { FakeBus } from '../../../test/fake-bus.js';
import {
  catalogOf,
  directoryOf,
  pluginSettings,
  poll,
} from '../../../test/discovered-plugins.js';
import type { IngestService } from '../../ingest/contracts.js';
import { roleSettings } from '../../platform/role/role.config.js';
import { AccountRejectedCommand } from '../application/accounts.js';
import type { ConnectorRuns } from '../application/connector-runs.js';
import type { ConnectorSchedules } from '../application/connector-schedules.js';
import { POLL, TICK, type ConnectorJob } from './connectors.queue.js';
import { ConnectorsWorker } from './connectors.worker.js';

const job = (name: string, portal = 'moodle', account = 'shared') =>
  ({ name, data: { portal, account } }) as Job<ConnectorJob>;

// in a process of `role`, which runs the workers unless it's an api one;
// lms is read with users' own accounts, ana's linked, bo's no longer
function worker(
  polled: (ctx: ConnectorContext) => Promise<void>,
  role = 'all',
) {
  const pollNow = vi.fn(async () => {});
  const remove = vi.fn(async () => {});
  const runs = { ended: vi.fn() } satisfies ConnectorRuns;
  const config = { ...pluginSettings(), pollTimeoutMs: 50, concurrency: 2 };
  const settings = roleSettings.parse({ APP_ROLE: role });
  const commands = new FakeBus();
  const credential = { kind: 'token' as const, token: new Secret('ana~1') };
  const w = new ConnectorsWorker(
    catalogOf({
      polls: [poll('moodle', { poll: polled }), poll('lms', { poll: polled })],
    }),
    directoryOf(
      { lms: ['ana', 'bo'] },
      { ana: credential },
      {} as IngestService,
    ),
    { pollNow, remove } as unknown as ConnectorSchedules,
    config,
    settings,
    runs,
    commands.commands as CommandBus,
  );
  // the BullMQ worker Nest would have made for it
  const close = vi.fn(async () => {});
  if (settings.worker)
    Object.defineProperty(w, 'worker', { value: { close, concurrency: 1 } });
  return { w, pollNow, remove, close, runs, commands };
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
    const run = w.process(job(POLL));
    // nothing but its own promises holds a poll that waits on nothing, the
    // job neither: a GC meanwhile (vitest.config.ts exposes it) mustn't take
    // what lets go of it
    await setImmediate();
    gc!();
    await expect(run).rejects.toThrow(/poll stopped/);
  });

  it('stops a poll whose job was cancelled', async () => {
    let signal: AbortSignal | undefined;
    const { w } = worker((ctx) => {
      signal = ctx.signal;
      return new Promise(() => {});
    });
    const cancel = new AbortController();

    const run = w.process(job(POLL), 'token', cancel.signal);
    // the poll starts once its context is made, well within its time
    await vi.waitFor(() => expect(signal).toBeDefined(), { interval: 1 });
    cancel.abort('its lock was lost');

    await expect(run).rejects.toThrow('poll stopped: its lock was lost');
    expect(signal?.aborted).toBe(true);
  });

  it('lets go of its polls at shutdown and starts none after', async () => {
    // one that doesn't listen to its signal
    const polled = vi.fn(() => new Promise<void>(() => {}));
    const { w, close } = worker(polled);
    const running = w.process(job(POLL), 'token', new AbortController().signal);
    await vi.waitFor(() => expect(polled).toHaveBeenCalled(), { interval: 1 });

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

  it("polls a user's own account with its credential, and drops the schedule of one that no longer reads", async () => {
    const seen: ConnectorContext[] = [];
    const { w, remove } = worker(async (ctx) => void seen.push(ctx));

    expect(await w.process(job(POLL, 'lms', 'ana'))).toBe(true);
    expect(await w.process(job(POLL, 'lms', 'bo'))).toBe(false);

    expect(seen).toHaveLength(1);
    const [{ account }] = seen;
    expect(account.kind).toBe('user');
    if (account.kind === 'user')
      expect((await account.credential()).token.reveal()).toBe('ana~1');
    expect(remove).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ key: 'lms__bo' }),
    );
  });

  it("takes a credential the portal rejects for a user's account for revoked, and drops its schedule", async () => {
    const { w, remove, commands } = worker(async () => {
      throw new CredentialRejectedError();
    });

    await expect(w.process(job(POLL, 'lms', 'ana'))).rejects.toThrow(
      CredentialRejectedError,
    );
    // the credential the run had, by its seal
    expect(commands.sent).toEqual([
      new AccountRejectedCommand('ana', 'seal-of-ana'),
    ]);
    expect(remove).toHaveBeenCalledOnce();

    // the shared account's is the owner's to replace
    await expect(w.process(job(POLL))).rejects.toThrow(CredentialRejectedError);
    expect(commands.sent).toHaveLength(1);
  });

  it('runs as many polls at once as CONNECTOR_CONCURRENCY says, once its worker is ready', () => {
    const { w } = worker(async () => {});
    w.ready();
    expect(w.worker.concurrency).toBe(2);
  });

  it('has no worker to close in an api process, which registers none', async () => {
    const { w } = worker(async () => {}, 'api');
    await expect(w.onModuleDestroy()).resolves.toBeUndefined();
  });
});
