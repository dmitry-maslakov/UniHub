import { Logger } from '@nestjs/common';
import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import type { PrismaHealthIndicator } from '@nestjs/terminus';
import { RateLimitError, type Job, type Queue } from 'bullmq';
import type { PrismaService } from '../../platform/database/prisma.service.js';

// A job that fails while something it needs is away isn't its own failure:
// the queue pauses, and the job goes back to wait without spending an
// attempt (five take about 75 s, an outage can take longer).
export const OUTAGE_PAUSE_MS = 30_000;

// A worker that pauses its queue through an outage. BullMQ only honours
// queue.rateLimit() on a queue with a limiter, so each sets one far above
// what it gets through, for the pause.
export abstract class PausingWorker<T> extends WorkerHost {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    private readonly health: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly queue: Queue<T>,
  ) {
    super();
  }

  // what the log calls a job's work
  protected abstract nameOf(job: Job<T>): string;

  // Asked of the database itself: a job's own calls fail with the same
  // connection errors, and one flaky site mustn't pause every plugin.
  protected async databaseAway() {
    const { database } = await this.health
      .pingCheck('database', this.prisma)
      .withTimeout(5_000);
    return database.status !== 'up';
  }

  protected async pause(): Promise<never> {
    await this.queue.rateLimit(OUTAGE_PAUSE_MS);
    throw new RateLimitError();
  }

  // BullMQ sets finishedOn only on a job that won't run again: out of
  // attempts, or failed for good by stalling too often
  @OnWorkerEvent('failed')
  failed(job: Job<T> | undefined, error: Error) {
    if (job?.finishedOn)
      this.logger.error(
        `${this.nameOf(job)} gave up on job ${job.id}`,
        error.stack,
      );
  }

  // its worker went away, or held the event loop past the lock; it runs
  // again, or fails if it stalled before
  @OnWorkerEvent('stalled')
  stalled(jobId: string) {
    this.logger.warn(`job ${jobId} stalled`);
  }
}
