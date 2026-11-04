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
import { DeliverMessage } from '../application/deliver-message.js';
import { pluginOf, type PluginJob } from '../application/plugin-job.js';
import { ProcessContent } from '../application/process-content.js';
import { PLUGINS_QUEUE } from './plugins.queue.js';

// A job that fails while the database is away isn't the plugin's failure:
// the queue pauses, and the job goes back to wait without spending an
// attempt (five take about 75 s, an outage can take longer). Asked of the
// database itself: a plugin's own calls fail with the same connection
// errors, and one flaky site mustn't pause every plugin.
export const OUTAGE_PAUSE_MS = 30_000;

// A processor that keeps the event loop busy stops the lock being renewed;
// the lock must outlast that or the job runs twice. BullMQ only honours
// queue.rateLimit() on a queue with a limiter; this one is far above what
// four at a time get through, it's there for the pause
@Processor(PLUGINS_QUEUE, {
  concurrency: 4,
  lockDuration: 5 * 60_000,
  limiter: { max: 1_000, duration: 1_000 },
})
export class PluginsWorker extends WorkerHost {
  private readonly logger = new Logger(PluginsWorker.name);

  constructor(
    private readonly deliver: DeliverMessage,
    private readonly processContent: ProcessContent,
    private readonly health: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    @InjectQueue(PLUGINS_QUEUE) private readonly queue: Queue<PluginJob>,
  ) {
    super();
  }

  async process({ data }: Job<PluginJob>) {
    try {
      return await (data.kind === 'handle'
        ? this.deliver.run(data)
        : this.processContent.run(data));
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
        `${pluginOf(job.data)} gave up on job ${job.id}`,
        error.stack,
      );
  }
}
