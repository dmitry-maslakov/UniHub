import type { ConfigType } from '@nestjs/config';
import type { PrismaHealthIndicator } from '@nestjs/terminus';
import type { Job, Queue } from 'bullmq';
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

function worker(counts: number[] = [0]) {
  const getJobCounts = vi.fn(async () => ({ waiting: counts.shift() ?? 0 }));
  const metrics = testMeter();
  const health = {
    pingCheck: () => ({
      withTimeout: async () => ({ database: { status: 'up' } }),
    }),
  } as unknown as PrismaHealthIndicator;
  const queue = { getJobCounts, rateLimit: vi.fn(async () => {}) };
  const w = new ModelsWorker(
    { run: async () => 'done' } as unknown as ProcessContent,
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
