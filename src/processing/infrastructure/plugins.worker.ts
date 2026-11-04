import { InjectQueue, Processor } from '@nestjs/bullmq';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import type { Job, Queue } from 'bullmq';
import { PrismaService } from '../../platform/database/prisma.service.js';
import { DeliverMessage } from '../application/deliver-message.js';
import { pluginOf, type PluginJob } from '../application/plugin-job.js';
import { ProcessContent } from '../application/process-content.js';
import { OUTAGE_PAUSE_MS, PausingWorker } from './pausing.worker.js';
import { PLUGINS_QUEUE } from './plugins.queue.js';

// A job that fails while the database is away isn't the plugin's failure.
// A processor that keeps the event loop busy stops the lock being renewed;
// the lock must outlast that or the job runs twice.
@Processor(PLUGINS_QUEUE, {
  concurrency: 4,
  lockDuration: 5 * 60_000,
  limiter: { max: 1_000, duration: 1_000 },
})
export class PluginsWorker extends PausingWorker<PluginJob> {
  constructor(
    private readonly deliver: DeliverMessage,
    private readonly processContent: ProcessContent,
    health: PrismaHealthIndicator,
    prisma: PrismaService,
    @InjectQueue(PLUGINS_QUEUE) queue: Queue<PluginJob>,
  ) {
    super(health, prisma, queue);
  }

  async process({ data }: Job<PluginJob>) {
    try {
      return await (data.kind === 'handle'
        ? this.deliver.run(data)
        : this.processContent.run(data));
    } catch (err) {
      if (!(await this.databaseAway())) throw err;
      this.logger.warn(
        `the database is away, plugins wait ${OUTAGE_PAUSE_MS / 1000} s`,
      );
      return this.pause();
    }
  }

  protected nameOf(job: Job<PluginJob>) {
    return pluginOf(job.data);
  }
}
