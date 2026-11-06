import { Inject, type OnModuleDestroy } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor } from '@nestjs/bullmq';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import type { Counter, Meter } from '@opentelemetry/api';
import type { Job, Queue } from 'bullmq';
import { PrismaService } from '../../platform/database/prisma.service.js';
import { METER } from '../../platform/metrics/metrics.module.js';
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
  private readonly jobs: Counter;
  private readonly deadLetters: Counter;

  constructor(
    private readonly deliver: DeliverMessage,
    private readonly processContent: ProcessContent,
    private readonly unpackContent: UnpackContent,
    health: PrismaHealthIndicator,
    prisma: PrismaService,
    @InjectQueue(PLUGINS_QUEUE) queue: Queue<PluginJob>,
    @Inject(METER) meter: Meter,
  ) {
    super(health, prisma, queue);
    this.jobs = meter.createCounter('unihub.plugin.jobs', {
      description:
        "plugins' jobs by processor, unpacker or aggregator: completed, or failed (tried again while attempts are left)",
    });
    this.deadLetters = meter.createCounter('unihub.plugin.dead_letters', {
      description:
        "plugins' jobs given up for good: out of attempts, or stalled too often",
    });
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

  // a job paused for an outage or put back at shutdown is neither
  @OnWorkerEvent('completed')
  countCompleted(job: Job<PluginJob>) {
    this.jobs.add(1, { plugin: pluginOf(job.data), outcome: 'completed' });
  }

  // given up for good as PausingWorker logs it, by finishedOn
  @OnWorkerEvent('failed')
  countFailed(job: Job<PluginJob> | undefined) {
    if (!job) return;
    const plugin = pluginOf(job.data);
    this.jobs.add(1, { plugin, outcome: 'failed' });
    if (job.finishedOn) this.deadLetters.add(1, { plugin });
  }
}
