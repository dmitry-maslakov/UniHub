import type { ConfigType } from '@nestjs/config';
import type { PrismaHealthIndicator } from '@nestjs/terminus';
import { RateLimitError, type Job, type Queue } from 'bullmq';
import { PluginName } from '@app/kernel';
import { ModelUnavailableError } from '@app/plugin-sdk';
import { testMeter } from '../../../test/metrics.js';
import { sha256 } from '../../../test/sha256.js';
import type { PrismaService } from '../../platform/database/prisma.service.js';
import type { roleConfig } from '../../platform/role/role.config.js';
import type { PluginJob } from '../application/plugin-job.js';
import type { ProcessContent } from '../application/process-content.js';
import { ModelsWorker } from './models.worker.js';

const data: PluginJob = {
  kind: 'process',
  key: {
    hash: sha256('%PDF lecture'),
    processor: PluginName.parse('whisper'),
    version: 1,
  },
};

const job = (fields: Partial<Job> = {}) =>
  ({ id: 'job-1', data, ...fields }) as Job<PluginJob>;

function worker(
  counts: number[] = [0],
  run: () => Promise<unknown> = async () => 'done',
) {
  const getJobCounts = vi.fn(async () => ({ waiting: counts.shift() ?? 0 }));
  const metrics = testMeter();
  const health = {
    pingCheck: () => ({
      withTimeout: async () => ({ database: { status: 'up' } }),
    }),
  } as unknown as PrismaHealthIndicator;
  const queue = { getJobCounts, rateLimit: vi.fn(async () => {}) };
  const w = new ModelsWorker(
    { run } as unknown as ProcessContent,
    health,
    {} as PrismaService,
    queue as unknown as Queue<PluginJob>,
    metrics.meter,
    { models: true } as ConfigType<typeof roleConfig>,
  );
  return { w, queue, metrics };
}

describe('ModelsWorker', () => {
  it('is drained once the queue has nothing to do', async () => {
    const { w, queue } = worker([0]);
    expect(await w.drained()).toBe(true);
    expect(queue.getJobCounts).toHaveBeenCalledTimes(1);
  });

  it('is not drained at shutdown, with work left', async () => {
    const { w } = worker([1, 1, 1]);
    const draining = w.drained();
    w.onModuleDestroy();
    expect(await draining).toBe(false);
  });

  it('refuses a job that is not a process', async () => {
    const { w } = worker();
    await expect(
      w.process(job({ data: { kind: 'handle' } as unknown as PluginJob })),
    ).rejects.toThrow('a handle job in models');
  });

  it('treats a model that cannot be reached as away', async () => {
    const { w } = worker();
    expect(await w['away'](new ModelUnavailableError('whisper is down'))).toBe(
      true,
    );
  });

  it('fails a job whose model is away ten times running, and counts by job', async () => {
    const run = vi.fn(async () => {
      throw new ModelUnavailableError('the model answered 503');
    });
    const { w, queue } = worker([0], run);
    // nine waits, the other job in between starts the count anew
    for (let i = 0; i < 9; i++)
      await expect(w.process(job())).rejects.toThrow(RateLimitError);
    await expect(w.process(job({ id: 'job-2' }))).rejects.toThrow(
      RateLimitError,
    );
    for (let i = 0; i < 9; i++)
      await expect(w.process(job())).rejects.toThrow(RateLimitError);
    const failure = await w.process(job()).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(ModelUnavailableError);
    expect(failure).not.toBeInstanceOf(RateLimitError);
    expect((failure as Error).message).toContain('job-1');
    expect(queue.rateLimit).toHaveBeenCalledTimes(19);
  });

  it('counts a failed job, and a given-up one apart', async () => {
    const { w, metrics } = worker();
    w.countFailed(job());
    w.countFailed(job({ finishedOn: 1 }));
    expect(await metrics.read()).toEqual({
      'unihub.plugin.jobs{plugin=whisper,outcome=failed}': 2,
      'unihub.plugin.dead_letters{plugin=whisper}': 1,
    });
  });
});
