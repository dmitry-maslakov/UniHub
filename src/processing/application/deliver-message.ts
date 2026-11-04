import { Injectable } from '@nestjs/common';
import { PluginCatalog } from '../../plugins/contracts.js';
import type { HandleJob } from './plugin-job.js';

@Injectable()
export class DeliverMessage {
  constructor(private readonly plugins: PluginCatalog) {}

  // to nobody if the aggregator was turned off since the job was queued
  async run({ aggregator, message }: HandleJob) {
    await this.plugins.aggregator(aggregator)?.instance.handle(message);
  }
}
