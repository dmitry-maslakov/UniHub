import { Logger } from '@nestjs/common';
import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { RateLimitError, type Job, type Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PluginRunner } from '../application/plugin-runner.js';
import { PLUGINS_QUEUE, type PluginJob } from '../queues.js';

// A job that fails while the database is away isn't the plugin's failure:
// the whole queue waits it out, and the job goes back to wait without
// spending an attempt (five take about 75 s, an outage can take longer)
export const OUTAGE_PAUSE_MS = 30_000;

// a big pdf can take a while; the lock must outlast it or the job runs twice
@Processor(PLUGINS_QUEUE, { concurrency: 4, lockDuration: 5 * 60_000 })
export class PluginsWorker extends WorkerHost {
  private readonly logger = new Logger(PluginsWorker.name);

  constructor(
    private readonly runner: PluginRunner,
    private readonly prisma: PrismaService,
    @InjectQueue(PLUGINS_QUEUE) private readonly queue: Queue<PluginJob>,
  ) {
    super();
  }

  async process(job: Job<PluginJob>) {
    try {
      return await this.runner.run(job.data);
    } catch (err) {
      if (await this.prisma.isReachable()) throw err;
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
