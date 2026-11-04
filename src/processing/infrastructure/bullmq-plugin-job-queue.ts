import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { again, once } from '../../platform/queues/job-ids.js';
import { jobId, pluginOf, type PluginJob } from '../application/plugin-job.js';
import { PluginJobQueue } from '../application/ports.js';
import { PLUGINS_QUEUE } from './plugins.queue.js';

// jobs named after their plugin
@Injectable()
export class BullmqPluginJobQueue extends PluginJobQueue {
  constructor(
    @InjectQueue(PLUGINS_QUEUE) private readonly queue: Queue<PluginJob>,
  ) {
    super();
  }

  async enqueue(jobs: readonly PluginJob[]) {
    await this.queue.addBulk(
      jobs.map((job) => ({
        name: pluginOf(job),
        data: job,
        opts: once(jobId(job)),
      })),
    );
  }

  async requeue(job: PluginJob) {
    await this.queue.add(pluginOf(job), job, again(jobId(job)));
  }
}
