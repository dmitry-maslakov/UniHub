import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

// A delayed job (a retry's backoff) due within this is work too
export const SOON_MS = 60_000;

// BullMQ scores the delayed set by the time the job is due, times this (the
// rest of the score tells jobs due at once apart)
const SCORE_PER_MS = 0x1000;

type Counted = Pick<Queue, 'toKey'>;

// How many jobs the queue has to do: waiting, active (a worker that died with
// one holds it until the next run takes it back) and delayed for less than a
// minute. A run that finds none is done; the cron asks the same before it
// starts a model. All read in one transaction: a job failing into its
// backoff, or coming due from it, mustn't be missed in between.
export async function pendingJobs(
  queue: Counted,
  redis: Pick<Redis, 'multi'>,
  now = Date.now(),
) {
  const results = await redis
    .multi()
    .llen(queue.toKey('wait'))
    .llen(queue.toKey('active'))
    .zcard(queue.toKey('prioritized'))
    // the delayed set is ordered by when each is due: the first is the soonest
    .zrange(queue.toKey('delayed'), 0, '0', 'WITHSCORES')
    .exec();
  const [waiting, active, prioritized, soonest] = (results ?? []).map(
    ([error, result]) => {
      if (error) throw error;
      return result;
    },
  ) as [number, number, number, [string?, string?]];
  const ready = waiting + active + prioritized;
  if (ready > 0) return ready;
  const [, score] = soonest;
  return score !== undefined && Number(score) / SCORE_PER_MS < now + SOON_MS
    ? 1
    : 0;
}

// what `models:pending` exits with: 0 when there's work, 3 when there's none
// (1 and the rest are for a failure)
export const NOTHING_PENDING = 3;
export const exitCodeFor = (pending: number) =>
  pending > 0 ? 0 : NOTHING_PENDING;
