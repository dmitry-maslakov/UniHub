import { setTimeout } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import type { Meter } from '@opentelemetry/api';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export const STATES = ['waiting', 'active', 'delayed', 'failed'] as const;

// well below a scraper's timeout (10 s by default): the exporter has none
export const READ_TIMEOUT_MS = 2_000;

type Counted = Pick<Queue, 'name' | 'getJobCounts' | 'getRateLimitTtl'>;

const logger = new Logger('QueueMetrics');

// The queues' counts, read from Redis through BullMQ whenever a scrape asks:
// their jobs by state, and whether each waits out an outage, PausingWorker's
// pause being BullMQ's rate limit (getRateLimitTtl() counts it only past the
// limiter's max, which no queue gets near otherwise). A scrape that can't
// read them says so: the exporter keeps serving their last reading.
export function observeQueues(
  meter: Meter,
  queues: readonly Counted[],
  redis: Pick<Redis, 'status'>,
  timeoutMs = READ_TIMEOUT_MS,
) {
  const jobs = meter.createObservableGauge('unihub.queue.jobs', {
    description:
      "a queue's jobs: waiting, active, delayed (a retry's backoff too) and failed (given up for good, kept as long as the queue keeps them)",
  });
  const limited = meter.createObservableGauge('unihub.queue.rate_limited', {
    description: '1 while the queue waits out an outage, 0 otherwise',
  });
  const read = meter.createObservableGauge('unihub.queue.counts_read', {
    description:
      "1 when the scrape read the queues' counts, 0 when redis was away, slow or failing and they hold their last reading",
  });
  meter.addBatchObservableCallback(
    async (result) => {
      const counted = await countsOf(queues, redis, timeoutMs);
      result.observe(read, counted ? 1 : 0);
      for (const { queue, counts, ttl } of counted ?? []) {
        for (const state of STATES)
          result.observe(jobs, counts[state], { queue, state });
        result.observe(limited, ttl > 0 ? 1 : 0, { queue });
      }
    },
    [jobs, limited, read],
  );
}

// None while redis is away: a command would wait in ioredis's offline queue
// for as long as it is (maxRetriesPerRequest: null), and hold up the whole
// scrape. None either when it doesn't answer in time, or fails, which is
// logged.
async function countsOf(
  queues: readonly Counted[],
  redis: Pick<Redis, 'status'>,
  timeoutMs: number,
) {
  if (redis.status !== 'ready') return null;
  const reads = Promise.all(
    queues.map(async (queue) => {
      const [counts, ttl] = await Promise.all([
        queue.getJobCounts(...STATES),
        queue.getRateLimitTtl(),
      ]);
      return { queue: queue.name, counts, ttl };
    }),
  );
  const late = setTimeout(timeoutMs, null, { ref: false }).then(() => {
    throw new Error(`redis didn't answer within ${timeoutMs} ms`);
  });
  return Promise.race([reads, late]).catch((err: unknown) => {
    logger.warn(`queue counts not read: ${(err as Error).message}`);
    return null;
  });
}
