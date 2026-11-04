import type { JobsOptions } from 'bullmq';

// How the same work is kept from being queued twice. BullMQ keeps a job's
// own id and its deduplication id apart: the custom id lasts as long as the
// queue keeps the job (its removeOnComplete and removeOnFail), the
// deduplication one until it's done or failed.

// Both, so neither queues what the other has waiting or running: dropped
// while the same work waits or runs, and then while the queue keeps it.
export const once = (id: string) =>
  ({ jobId: id, deduplication: { id } }) satisfies JobsOptions;

// Dropped only while the same work waits or runs, so a job that finished or
// failed doesn't keep it from being queued again.
export const again = (id: string) =>
  ({ deduplication: { id } }) satisfies JobsOptions;
