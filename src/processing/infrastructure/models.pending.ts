import type { Queue } from 'bullmq';

type Counted = Pick<Queue, 'getJobCounts'>;

// How many jobs the queue has to do: waiting, active (a worker that died with
// one holds it until the next run takes it back) and delayed (a retry's
// backoff). A run that finds none is done; the cron asks the same before it
// starts a model. BullMQ counts them all in one atomic call.
export async function pendingJobs(queue: Counted) {
  const counts = await queue.getJobCounts(
    'waiting',
    'active',
    'prioritized',
    'delayed',
  );
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

// what `models:pending` exits with: 0 when there's work, 3 when there's none
// (1 and the rest are for a failure)
export const NOTHING_PENDING = 3;
export const exitCodeFor = (pending: number) =>
  pending > 0 ? 0 : NOTHING_PENDING;
