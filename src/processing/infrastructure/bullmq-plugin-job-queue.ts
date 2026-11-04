import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { jobId, pluginOf, type PluginJob } from '../application/plugin-job.js';
import { PluginJobQueue } from '../application/ports.js';
import { PLUGINS_QUEUE } from './plugins.queue.js';

// Jobs named after their plugin. BullMQ keeps a job's own id and its
// deduplication id apart: the custom id lasts as long as the queue keeps the
// job (processing.module.ts), the deduplication one until it's done or
// failed. enqueue sets both, so neither queues what the other has waiting or
// running.
@Injectable()
export class BullmqPluginJobQueue extends PluginJobQueue {
  constructor(
    @InjectQueue(PLUGINS_QUEUE) private readonly queue: Queue<PluginJob>,
  ) {
    super();
  }

  async enqueue(jobs: readonly PluginJob[]) {
    await this.queue.addBulk(
      jobs.map((job) => {
        const id = jobId(job);
        return {
          name: pluginOf(job),
          data: job,
          opts: { jobId: id, deduplication: { id } },
        };
      }),
    );
  }

  async requeue(job: PluginJob) {
    await this.queue.add(pluginOf(job), job, {
      deduplication: { id: jobId(job) },
    });
  }
}
