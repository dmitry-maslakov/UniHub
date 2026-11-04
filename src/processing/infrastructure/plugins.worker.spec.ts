import type { PrismaHealthIndicator } from '@nestjs/terminus';
import { RateLimitError, type Job, type Queue } from 'bullmq';
import { FILE_CONTENT_STORED } from '@app/plugin-sdk';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { PluginRunner } from '../application/plugin-runner.js';
import type { PluginJob } from '../queues.js';
import { OUTAGE_PAUSE_MS, PluginsWorker } from './plugins.worker.js';

const job = {
  data: {
    plugin: 'pdf',
    message: {
      topic: FILE_CONTENT_STORED,
      payload: { portal: 'p', fileId: 'f1', hash: 'h' },
    },
  },
} as Job<PluginJob>;

function worker(database: 'up' | 'down') {
  const runner = {
    run: async () => {
      throw new Error('plugin failed');
    },
  } as unknown as PluginRunner;
  const health = {
    pingCheck: () => ({
      withTimeout: async () => ({ database: { status: database } }),
    }),
  } as unknown as PrismaHealthIndicator;
  const queue = { rateLimit: vi.fn(async () => {}) };
  return {
    worker: new PluginsWorker(
      runner,
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
    await expect(w.process(job)).rejects.toThrow('plugin failed');
    expect(queue.rateLimit).not.toHaveBeenCalled();
  });

  it('waits out the database being away without spending an attempt', async () => {
    const { worker: w, queue } = worker('down');
    await expect(w.process(job)).rejects.toBeInstanceOf(RateLimitError);
    expect(queue.rateLimit).toHaveBeenCalledWith(OUTAGE_PAUSE_MS);
  });
});
