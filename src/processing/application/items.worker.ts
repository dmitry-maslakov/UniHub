import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PluginRegistry } from '../../plugins/plugin-registry.js';
import { ITEMS_QUEUE } from '../queues.js';

@Processor(ITEMS_QUEUE)
export class ItemsWorker extends WorkerHost {
  constructor(private readonly plugins: PluginRegistry) {
    super();
  }

  async process(job: Job) {
    for (const { instance } of this.plugins.aggregatorsFor(job.name))
      await instance.handle(job.name, job.data);
  }
}
