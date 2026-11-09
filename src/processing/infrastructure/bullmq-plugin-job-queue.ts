import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { again, once } from '../../platform/queues/job-ids.js';
import { PluginCatalog } from '../../plugins/contracts.js';
import { isHeavy } from '../application/heavy-job.js';
import { jobId, pluginOf, type PluginJob } from '../application/plugin-job.js';
import { PluginJobQueue } from '../application/ports.js';
import { MODELS_QUEUE } from './models.queue.js';
import { PLUGINS_QUEUE } from './plugins.queue.js';

// Jobs named after their plugin. Every job goes through here, so which queue
// takes it is decided in this one place: a heavy processor's to `models`,
// the rest to `plugins`.
@Injectable()
export class BullmqPluginJobQueue extends PluginJobQueue {
  constructor(
    @InjectQueue(PLUGINS_QUEUE) private readonly main: Queue<PluginJob>,
    @InjectQueue(MODELS_QUEUE) private readonly models: Queue<PluginJob>,
    private readonly plugins: PluginCatalog,
  ) {
    super();
  }

  private queueOf(job: PluginJob) {
    return isHeavy(job, this.plugins) ? this.models : this.main;
  }

  async enqueue(jobs: readonly PluginJob[]) {
    for (const queue of [this.main, this.models])
      await queue.addBulk(
        jobs
          .filter((job) => this.queueOf(job) === queue)
          .map((job) => ({
            name: pluginOf(job),
            data: job,
            opts: once(jobId(job)),
          })),
      );
  }

  async requeue(job: PluginJob) {
    await this.queueOf(job).add(pluginOf(job), job, again(jobId(job)));
  }
}
