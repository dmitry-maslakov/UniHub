import { Module, type OnApplicationBootstrap } from '@nestjs/common';
import { BullModule, BullRegistrar } from '@nestjs/bullmq';
import { PluginRunner } from './application/plugin-runner.js';
import { OutboxRetention } from './infrastructure/outbox-retention.js';
import { PluginsWorker } from './infrastructure/plugins.worker.js';
import { PLUGINS_QUEUE } from './queues.js';

const DAY = 24 * 60 * 60;

@Module({
  imports: [
    BullModule.registerQueue({
      name: PLUGINS_QUEUE,
      defaultJobOptions: {
        // plugins have to be idempotent
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        // a finished job keeps its id for a day, longer than the outbox may
        // take to publish the same message again
        removeOnComplete: { age: DAY },
        removeOnFail: { age: 14 * DAY },
      },
    }),
  ],
  providers: [PluginRunner, PluginsWorker, OutboxRetention],
  // the outbox transport adds jobs to the queue
  exports: [BullModule],
})
export class ProcessingModule implements OnApplicationBootstrap {
  constructor(private readonly registrar: BullRegistrar) {}

  // Workers are registered by hand (manualRegistration in the app module), once
  // every module is initialised, so no job runs before the plugin registry is
  // filled.
  onApplicationBootstrap() {
    this.registrar.register();
  }
}
