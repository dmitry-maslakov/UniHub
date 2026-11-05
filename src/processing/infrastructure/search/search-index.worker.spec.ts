import { Logger } from '@nestjs/common';
import type { PrismaHealthIndicator } from '@nestjs/terminus';
import { RateLimitError, type Job, type Queue } from 'bullmq';
import { PluginName } from '@app/kernel';
import { sha256 } from '../../../../test/sha256.js';
import type { PrismaService } from '../../../platform/database/prisma.service.js';
import type { IndexText } from '../../application/index-text.js';
import {
  EmbedderUnavailableError,
  TextIndexUnavailableError,
} from '../../application/ports.js';
import { OUTAGE_PAUSE_MS } from '../pausing.worker.js';
import type { IndexJob } from './search-index.queue.js';
import { SearchIndexWorker } from './search-index.worker.js';

const job = {
  id: 'job-1',
  data: {
    key: {
      hash: sha256('%PDF lecture'),
      processor: PluginName.parse('office-text'),
      version: 1,
    },
  },
} as Job<IndexJob>;

// a worker whose jobs fail with what `run` throws, the database up or down
function worker(run: () => Promise<void>, database: 'up' | 'down' = 'up') {
  const health = {
    pingCheck: () => ({
      withTimeout: async () => ({ database: { status: database } }),
    }),
  } as unknown as PrismaHealthIndicator;
  const queue = { rateLimit: vi.fn(async () => {}) };
  return {
    worker: new SearchIndexWorker(
      { run } as unknown as IndexText,
      health,
      {} as PrismaService,
      queue as unknown as Queue<IndexJob>,
    ),
    queue,
  };
}

const away = async () => {
  throw new TextIndexUnavailableError('connect ECONNREFUSED');
};

describe('SearchIndexWorker', () => {
  afterEach(() => vi.restoreAllMocks());

  it('waits out the index being away without spending an attempt', async () => {
    const { worker: w, queue } = worker(away);

    await expect(w.process(job)).rejects.toBeInstanceOf(RateLimitError);
    expect(queue.rateLimit).toHaveBeenCalledWith(OUTAGE_PAUSE_MS);
  });

  it('waits out the embedder being away', async () => {
    const { worker: w, queue } = worker(async () => {
      throw new EmbedderUnavailableError('http://embedder/embed: ECONNREFUSED');
    });

    await expect(w.process(job)).rejects.toBeInstanceOf(RateLimitError);
    expect(queue.rateLimit).toHaveBeenCalledWith(OUTAGE_PAUSE_MS);
  });

  it('waits out the database being away', async () => {
    const { worker: w, queue } = worker(async () => {
      throw new Error('connection is closed');
    }, 'down');

    await expect(w.process(job)).rejects.toBeInstanceOf(RateLimitError);
    expect(queue.rateLimit).toHaveBeenCalledWith(OUTAGE_PAUSE_MS);
  });

  it("lets the job's own failure spend an attempt", async () => {
    const { worker: w, queue } = worker(async () => {
      throw new Error('index exists with another mapping');
    });

    await expect(w.process(job)).rejects.toThrow('another mapping');
    expect(queue.rateLimit).not.toHaveBeenCalled();
  });

  it('logs an error once the pauses in a row reach twenty, a warning before', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockReturnValue();
    const error = vi.spyOn(Logger.prototype, 'error').mockReturnValue();
    const { worker: w } = worker(away);

    for (let i = 0; i < 20; i++) await w.process(job).catch(() => {});

    expect(warn).toHaveBeenCalledTimes(19);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('counts the pauses anew after a job goes through', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockReturnValue();
    vi.spyOn(Logger.prototype, 'warn').mockReturnValue();
    let fails = true;
    const { worker: w } = worker(() => (fails ? away() : Promise.resolve()));

    for (let i = 0; i < 19; i++) await w.process(job).catch(() => {});
    fails = false;
    await w.process(job);
    fails = true;
    await w.process(job).catch(() => {});

    expect(error).not.toHaveBeenCalled();
  });
});
