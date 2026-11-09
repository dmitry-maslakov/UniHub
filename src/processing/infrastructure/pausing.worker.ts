import { Logger } from '@nestjs/common';
import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import type { PrismaHealthIndicator } from '@nestjs/terminus';
import {
  RateLimitError,
  WaitingError,
  type Job,
  type Queue,
  type WorkerOptions,
} from 'bullmq';
import type { PrismaService } from '../../platform/database/prisma.service.js';

// A job that fails while something it needs is away isn't its own failure:
// the queue pauses, and the job goes back to wait without spending an
// attempt (five take about 75 s, an outage can take longer).
export const OUTAGE_PAUSE_MS = 30_000;

// What a pausing worker's @Processor spreads. BullMQ only honours
// queue.rateLimit() on a queue with a limiter, so this one is far above what
// any gets through, for the pause. A processor that keeps the event loop
// busy stops the locks of every worker in the process being renewed; the
// lock must outlast that or the job runs twice.
export const PAUSING = {
  lockDuration: 5 * 60_000,
  limiter: { max: 1_000, duration: 1_000 },
} satisfies Partial<WorkerOptions>;

// A worker that pauses its queue through an outage.
export abstract class PausingWorker<T> extends WorkerHost {
  protected readonly logger = new Logger(this.constructor.name);
  // Aborted at shutdown by a worker whose jobs take long, so closing doesn't
  // wait them out: a job it stops goes back to wait without spending an
  // attempt, and runs anew from the next start. One fetched while the worker
  // closes gets it aborted already.
  protected readonly shutdown = new AbortController();

  constructor(
    private readonly health: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly queue: Queue<T>,
  ) {
    super();
  }

  // the job itself, stopped by the signal where it can be
  protected abstract work(job: Job<T>, signal: AbortSignal): Promise<unknown>;
  // logs the pause that `err`, an outage, brought
  protected abstract outage(err: unknown): void;
  // what the log calls a job's work
  protected abstract nameOf(job: Job<T>): string;

  async process(job: Job<T>, token?: string) {
    const { signal } = this.shutdown;
    try {
      return await this.work(job, signal);
    } catch (err) {
      if (signal.aborted) return this.putBack(job, token);
      if (!(await this.away(err))) throw err;
      this.outage(err);
      return this.pause();
    }
  }

  // Whether what failed the job is away: the database, asked of itself, as
  // a job's own calls fail with the same connection errors, and one flaky
  // site mustn't pause every plugin.
  protected async away(_err: unknown) {
    const { database } = await this.health
      .pingCheck('database', this.prisma)
      .withTimeout(5_000);
    return database.status !== 'up';
  }

  private async pause(): Promise<never> {
    await this.queue.rateLimit(OUTAGE_PAUSE_MS);
    throw new RateLimitError();
  }

  private async putBack(job: Job<T>, token?: string): Promise<never> {
    await job.moveToWait(token);
    throw new WaitingError();
  }

  // BullMQ sets finishedOn only on a job that won't run again: out of
  // attempts, or failed for good by stalling too often
  @OnWorkerEvent('failed')
  async failed(job: Job<T> | undefined, error: Error) {
    if (!job?.finishedOn) return;
    this.logger.error(
      `${this.nameOf(job)} gave up on job ${job.id}`,
      error.stack,
    );
    try {
      await this.gaveUp(job);
    } catch (err) {
      this.logger.error(
        `${this.nameOf(job)}: giving up on job ${job.id} failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // what a job given up for good leaves behind; nothing by default
  protected async gaveUp(_job: Job<T>): Promise<void> {}

  // its worker went away, or held the event loop past the lock; it runs
  // again, or fails if it stalled before
  @OnWorkerEvent('stalled')
  stalled(jobId: string) {
    this.logger.warn(`job ${jobId} stalled`);
  }
}
