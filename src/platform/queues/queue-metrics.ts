import type { Meter } from '@opentelemetry/api';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export const STATES = ['waiting', 'active', 'delayed', 'failed'] as const;

// The queues' counts, read from Redis through BullMQ whenever a scrape asks:
// their jobs by state, and whether each waits out an outage, PausingWorker's
// pause being BullMQ's rate limit (getRateLimitTtl() counts it only past the
// limiter's max, which no queue gets near otherwise).
export function observeQueues(
  meter: Meter,
  queues: readonly Pick<Queue, 'name' | 'getJobCounts' | 'getRateLimitTtl'>[],
  redis: Pick<Redis, 'status'>,
) {
  const jobs = meter.createObservableGauge('unihub.queue.jobs', {
    description:
      "a queue's jobs: waiting, active, delayed (a retry's backoff too) and failed (given up for good, kept as long as the queue keeps them)",
  });
  const limited = meter.createObservableGauge('unihub.queue.rate_limited', {
    description: '1 while the queue waits out an outage, 0 otherwise',
  });
  meter.addBatchObservableCallback(
    async (result) => {
      // a command would wait in ioredis's offline queue for as long as redis
      // is away, holding up the whole scrape: the counts are left out of it
      if (redis.status !== 'ready') return;
      await Promise.all(
        queues.map(async (queue) => {
          const [counts, ttl] = await Promise.all([
            queue.getJobCounts(...STATES),
            queue.getRateLimitTtl(),
          ]);
          for (const state of STATES)
            result.observe(jobs, counts[state], { queue: queue.name, state });
          result.observe(limited, ttl > 0 ? 1 : 0, { queue: queue.name });
        }),
      );
    },
    [jobs, limited],
  );
}
