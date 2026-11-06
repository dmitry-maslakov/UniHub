import { InjectQueue, Processor } from '@nestjs/bullmq';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import type { Job, Queue } from 'bullmq';
import { PrismaService } from '../../platform/database/prisma.service.js';
import { DeliverMessage } from '../application/deliver-message.js';
import { ExpandContent } from '../application/expand-content.js';
import { pluginOf, type PluginJob } from '../application/plugin-job.js';
import { ProcessContent } from '../application/process-content.js';
import { OUTAGE_PAUSE_MS, PAUSING, PausingWorker } from './pausing.worker.js';
import { PLUGINS_QUEUE } from './plugins.queue.js';

// A job that fails while the database is away isn't the plugin's failure.
@Processor(PLUGINS_QUEUE, { concurrency: 4, ...PAUSING })
export class PluginsWorker extends PausingWorker<PluginJob> {
  constructor(
    private readonly deliver: DeliverMessage,
    private readonly processContent: ProcessContent,
    private readonly expandContent: ExpandContent,
    health: PrismaHealthIndicator,
    prisma: PrismaService,
    @InjectQueue(PLUGINS_QUEUE) queue: Queue<PluginJob>,
  ) {
    super(health, prisma, queue);
  }

  protected work({ data }: Job<PluginJob>) {
    if (data.kind === 'handle') return this.deliver.run(data);
    if (data.kind === 'process') return this.processContent.run(data);
    return this.expandContent.run(data);
  }

  protected outage() {
    this.logger.warn(
      `the database is away, plugins wait ${OUTAGE_PAUSE_MS / 1000} s`,
    );
  }

  protected nameOf(job: Job<PluginJob>) {
    return pluginOf(job.data);
  }
}
