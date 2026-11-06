import type { OnModuleDestroy } from '@nestjs/common';
import { InjectQueue, Processor } from '@nestjs/bullmq';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import type { Job, Queue } from 'bullmq';
import { PrismaService } from '../../platform/database/prisma.service.js';
import { DeliverMessage } from '../application/deliver-message.js';
import { pluginOf, type PluginJob } from '../application/plugin-job.js';
import { ProcessContent } from '../application/process-content.js';
import { UnpackContent } from '../application/unpack-content.js';
import { OUTAGE_PAUSE_MS, PAUSING, PausingWorker } from './pausing.worker.js';
import { PLUGINS_QUEUE } from './plugins.queue.js';

// A job that fails while the database is away isn't the plugin's failure.
@Processor(PLUGINS_QUEUE, { concurrency: 4, ...PAUSING })
export class PluginsWorker
  extends PausingWorker<PluginJob>
  implements OnModuleDestroy
{
  constructor(
    private readonly deliver: DeliverMessage,
    private readonly processContent: ProcessContent,
    private readonly unpackContent: UnpackContent,
    health: PrismaHealthIndicator,
    prisma: PrismaService,
    @InjectQueue(PLUGINS_QUEUE) queue: Queue<PluginJob>,
  ) {
    super(health, prisma, queue);
  }

  // an unpacking takes up to minutes: it stops at shutdown, before the
  // workers close, and goes back to wait
  protected work({ data }: Job<PluginJob>, signal: AbortSignal) {
    if (data.kind === 'handle') return this.deliver.run(data);
    if (data.kind === 'process') return this.processContent.run(data);
    return this.unpackContent.run(data, signal);
  }

  onModuleDestroy() {
    this.shutdown.abort('the app is shutting down');
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
