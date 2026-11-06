import { Logger } from '@nestjs/common';
import type { PrismaHealthIndicator } from '@nestjs/terminus';
import { RateLimitError, WaitingError, type Job, type Queue } from 'bullmq';
import { PluginName } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import type { PrismaService } from '../../platform/database/prisma.service.js';
import type { DeliverMessage } from '../application/deliver-message.js';
import type { PluginJob } from '../application/plugin-job.js';
import type { ProcessContent } from '../application/process-content.js';
import type { UnpackContent } from '../application/unpack-content.js';
import { OUTAGE_PAUSE_MS } from './pausing.worker.js';
import { PluginsWorker } from './plugins.worker.js';
import { LIMITS } from '../domain/tree-budget.js';

const data: PluginJob = {
  kind: 'process',
  key: {
    hash: sha256('%PDF lecture'),
    processor: PluginName.parse('pdf'),
    version: 1,
  },
};

const job = (fields: Partial<Job> = {}) =>
  ({ id: 'job-1', data, ...fields }) as Job<PluginJob>;

function worker(database: 'up' | 'down', unpackContent = {} as UnpackContent) {
  const processContent = {
    run: async () => {
      throw new Error('plugin failed');
    },
  } as unknown as ProcessContent;
  const health = {
    pingCheck: () => ({
      withTimeout: async () => ({ database: { status: database } }),
    }),
  } as unknown as PrismaHealthIndicator;
  const queue = { rateLimit: vi.fn(async () => {}) };
  return {
    worker: new PluginsWorker(
      {} as DeliverMessage,
      processContent,
      unpackContent,
      health,
      {} as PrismaService,
      queue as unknown as Queue<PluginJob>,
    ),
    queue,
  };
}

describe('PluginsWorker', () => {
  it("lets a plugin's own failure spend an attempt", async () => {
    const { worker: w, queue } = worker('up');
    await expect(w.process(job())).rejects.toThrow('plugin failed');
    expect(queue.rateLimit).not.toHaveBeenCalled();
  });

  it('waits out the database being away without spending an attempt', async () => {
    const { worker: w, queue } = worker('down');
    await expect(w.process(job())).rejects.toBeInstanceOf(RateLimitError);
    expect(queue.rateLimit).toHaveBeenCalledWith(OUTAGE_PAUSE_MS);
  });

  it('stops an unpacking at shutdown and puts it back to wait without spending an attempt', async () => {
    const moveToWait = vi.fn(async () => 0);
    const unpacking = {
      run: (_: unknown, signal: AbortSignal) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason)),
        ),
    } as unknown as UnpackContent;
    const { worker: w } = worker('up', unpacking);
    const running = w.process(
      job({
        data: {
          kind: 'unpack',
          key: {
            hash: sha256('labs.zip'),
            unpacker: PluginName.parse('archives'),
            version: 1,
          },
          policy: LIMITS.policy,
        },
        moveToWait,
      } as unknown as Partial<Job>),
      'token-1',
    );

    w.onModuleDestroy();

    await expect(running).rejects.toBeInstanceOf(WaitingError);
    expect(moveToWait).toHaveBeenCalledWith('token-1');
  });

  it('logs a job that will not run again, whatever failed it', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockReturnValue();
    const { worker: w } = worker('up');
    const stall = new Error('job stalled more than allowable limit');

    // retried, then failed by stalling on its first attempt
    w.failed(job({ attemptsMade: 1 }), stall);
    w.failed(job({ attemptsMade: 1, finishedOn: 1 }), stall);

    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('pdf gave up on job job-1', stall.stack);
  });
});
