import { Logger } from '@nestjs/common';
import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import { RateLimitError, type Job, type Queue } from 'bullmq';
import { PrismaService } from '../../platform/database/prisma.service.js';
import { PluginRunner } from '../application/plugin-runner.js';
import { PLUGINS_QUEUE, type PluginJob } from '../queues.js';

// A job that fails while the database is away isn't the plugin's failure:
// the queue pauses, and the job goes back to wait without spending an
// attempt (five take about 75 s, an outage can take longer). Asked of the
// database itself: a plugin's own calls fail with the same connection
// errors, and one flaky site mustn't pause every plugin.
export const OUTAGE_PAUSE_MS = 30_000;

// a big pdf can take a while; the lock must outlast it or the job runs twice.
// BullMQ only honours queue.rateLimit() on a queue with a limiter; this one
// is far above what four at a time get through, it's there for the pause
@Processor(PLUGINS_QUEUE, {
  concurrency: 4,
  lockDuration: 5 * 60_000,
  limiter: { max: 1_000, duration: 1_000 },
})
export class PluginsWorker extends WorkerHost {
  private readonly logger = new Logger(PluginsWorker.name);

  constructor(
    private readonly runner: PluginRunner,
    private readonly health: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    @InjectQueue(PLUGINS_QUEUE) private readonly queue: Queue<PluginJob>,
  ) {
    super();
  }

  async process(job: Job<PluginJob>) {
    try {
      return await this.runner.run(job.data);
    } catch (err) {
      const { database } = await this.health
        .pingCheck('database', this.prisma)
        .withTimeout(5_000);
      if (database.status === 'up') throw err;
      this.logger.warn(
        `the database is away, plugins wait ${OUTAGE_PAUSE_MS / 1000} s`,
      );
      await this.queue.rateLimit(OUTAGE_PAUSE_MS);
      throw new RateLimitError();
    }
  }

  @OnWorkerEvent('failed')
  failed(job: Job<PluginJob> | undefined, error: Error) {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1))
      this.logger.error(
        `${job.data.plugin} gave up on ${job.data.message.topic} (job ${job.id})`,
        error.stack,
      );
  }
}
