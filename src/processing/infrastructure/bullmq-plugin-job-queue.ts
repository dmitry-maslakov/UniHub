import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { jobId, pluginOf, type PluginJob } from '../application/plugin-job.js';
import { PluginJobQueue } from '../application/ports.js';
import { PLUGINS_QUEUE } from './plugins.queue.js';

// Jobs named after their plugin. A job keeps its id for as long as the queue
// keeps it (processing.module.ts); a job that only deduplicates gives the
// id up once it's done or failed.
@Injectable()
export class BullmqPluginJobQueue extends PluginJobQueue {
  constructor(
    @InjectQueue(PLUGINS_QUEUE) private readonly queue: Queue<PluginJob>,
  ) {
    super();
  }

  async enqueue(jobs: readonly PluginJob[]) {
    // one addBulk is one transaction
    await this.queue.addBulk(
      jobs.map((job) => ({
        name: pluginOf(job),
        data: job,
        opts: { jobId: jobId(job) },
      })),
    );
  }

  async requeue(job: PluginJob) {
    await this.queue.add(pluginOf(job), job, {
      deduplication: { id: jobId(job) },
    });
  }
}
