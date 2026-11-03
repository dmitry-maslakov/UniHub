import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PluginRunner } from '../application/plugin-runner.js';
import { PLUGINS_QUEUE, type PluginJob } from '../queues.js';

@Processor(PLUGINS_QUEUE, { concurrency: 4 })
export class PluginsWorker extends WorkerHost {
  private readonly logger = new Logger(PluginsWorker.name);

  constructor(private readonly runner: PluginRunner) {
    super();
  }

  process(job: Job<PluginJob>) {
    return this.runner.run(job.data);
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
