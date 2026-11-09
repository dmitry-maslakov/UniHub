import { setTimeout as sleep } from 'node:timers/promises';
import {
  Inject,
  type OnApplicationShutdown,
  type OnModuleDestroy,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import type { Counter, Meter } from '@opentelemetry/api';
import { Worker, type Job, type Queue } from 'bullmq';
import { PrismaService } from '../../platform/database/prisma.service.js';
import { REDIS } from '../../platform/redis/redis.module.js';
import type { Redis } from 'ioredis';
import { METER } from '../../platform/metrics/metrics.module.js';
import { roleConfig } from '../../platform/role/role.config.js';
import { pluginOf, type PluginJob } from '../application/plugin-job.js';
import { ProcessContent } from '../application/process-content.js';
import { MODELS_QUEUE } from './models.queue.js';
import { pendingJobs } from './models.pending.js';
import { OUTAGE_PAUSE_MS, PAUSING, PausingWorker } from './pausing.worker.js';

// how often a run looks for work left
export const DRAIN_POLL_MS = 5_000;

// The heavy processors' worker, one job at a time (a model takes the memory
// of one), only in a process with APP_ROLE=models. BullRegistrar registers
// every @Processor of an app whole, so this one isn't: it makes its own
// BullMQ worker where the role says to, and the other roles never read the
// queue.
export class ModelsWorker
  extends PausingWorker<PluginJob>
  implements OnApplicationBootstrap, OnModuleDestroy, OnApplicationShutdown
{
  private consumer?: Worker<PluginJob>;
  private readonly jobs: Counter;
  private readonly deadLetters: Counter;

  constructor(
    private readonly processContent: ProcessContent,
    health: PrismaHealthIndicator,
    prisma: PrismaService,
    @InjectQueue(MODELS_QUEUE) private readonly models: Queue<PluginJob>,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(METER) meter: Meter,
    @Inject(roleConfig.KEY)
    private readonly role: ConfigType<typeof roleConfig>,
  ) {
    super(health, prisma, models);
    this.jobs = meter.createCounter('unihub.plugin.jobs', {
      description:
        "plugins' jobs by processor, unpacker or aggregator: completed, or failed (tried again while attempts are left)",
    });
    this.deadLetters = meter.createCounter('unihub.plugin.dead_letters', {
      description:
        "plugins' jobs given up for good: out of attempts, or stalled too often",
    });
  }

  // once every module is up, as the registrar starts the others: a job
  // taken before the query handlers are registered would fail
  onApplicationBootstrap() {
    if (!this.role.models) return;
    this.consumer = new Worker<PluginJob>(
      MODELS_QUEUE,
      (job, token) => this.process(job, token),
      { connection: this.models.opts.connection, concurrency: 1, ...PAUSING },
    )
      .on('completed', (job) =>
        this.jobs.add(1, { plugin: pluginOf(job.data), outcome: 'completed' }),
      )
      .on('failed', (job, error) => {
        this.failed(job, error);
        if (!job) return;
        const plugin = pluginOf(job.data);
        this.jobs.add(1, { plugin, outcome: 'failed' });
        if (job.finishedOn) this.deadLetters.add(1, { plugin });
      })
      .on('stalled', (id) => this.stalled(id))
      .on('error', (error) => this.logger.error(error.message, error.stack));
  }

  // resolves once the queue has nothing waiting, active or due soon, or at
  // shutdown
  async drained() {
    while (!this.shutdown.signal.aborted) {
      if ((await pendingJobs(this.models, this.redis)) === 0) return true;
      await sleep(DRAIN_POLL_MS, undefined, {
        signal: this.shutdown.signal,
      }).catch(() => {});
    }
    return false;
  }

  protected work({ data }: Job<PluginJob>, signal: AbortSignal) {
    if (data.kind !== 'process')
      throw new Error(`a ${data.kind} job in models`);
    return this.processContent.run(data, signal);
  }

  protected outage() {
    this.logger.warn(
      `the database is away, models wait ${OUTAGE_PAUSE_MS / 1000} s`,
    );
  }

  protected nameOf(job: Job<PluginJob>) {
    return pluginOf(job.data);
  }

  // a job being run goes back to wait, as the plugins' do
  onModuleDestroy() {
    this.shutdown.abort('the app is shutting down');
  }

  async onApplicationShutdown() {
    await this.consumer?.close();
  }
}
