import { GetTextPageHandler } from './application/queries/get-text-page.handler.js';
import { ListTextsHandler } from './application/queries/list-texts.handler.js';
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TerminusModule } from '@nestjs/terminus';
import { PluginRunner } from './application/plugin-runner.js';
import { Reconciler } from './application/reconciler.js';
import { RepresentationRepository } from './domain/representation.js';
import { PrismaRepresentationRepository } from './infrastructure/prisma-representation.repository.js';
import { ReconcileSchedule } from './infrastructure/reconcile.schedule.js';
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
    // the worker asks whether the database is up before blaming a plugin
    TerminusModule,
  ],
  providers: [
    ListTextsHandler,
    GetTextPageHandler,
    PluginRunner,
    PluginsWorker,
    Reconciler,
    ReconcileSchedule,
    {
      provide: RepresentationRepository,
      useClass: PrismaRepresentationRepository,
    },
  ],
  // the plugins queue, for PluginsOutboxTransport: the outbox makes it,
  // with this module's exports (AppModule wires it into messaging)
  exports: [BullModule],
})
export class ProcessingModule {}
