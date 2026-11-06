import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TerminusModule } from '@nestjs/terminus';
import { whenSearchOn } from '../platform/search/opensearch.config.js';
import { PluginsModule } from '../plugins/contracts.js';
import { StorageModule } from '../storage/contracts.js';
import { DeliverMessage } from './application/deliver-message.js';
import { ContentMembers } from './application/content-members.js';
import { ContentNames } from './application/content-names.js';
import { Dispatch } from './application/dispatch.js';
import { ExpandContent } from './application/expand-content.js';
import { FileFacts, PluginJobQueue, TextReads } from './application/ports.js';
import { ProcessContent } from './application/process-content.js';
import { Reconcile } from './application/reconcile.js';
import { SearchTexts } from './application/search-texts.js';
import { GetTextPage, ListTexts } from './application/texts.js';
import { ExpansionRepository } from './domain/expansion.js';
import { RepresentationRepository } from './domain/representation.js';
import { BullmqPluginJobQueue } from './infrastructure/bullmq-plugin-job-queue.js';
import { CatalogFileFacts } from './infrastructure/catalog-file-facts.js';
import { PLUGINS_QUEUE } from './infrastructure/plugins.queue.js';
import { PluginsWorker } from './infrastructure/plugins.worker.js';
import { PrismaExpansionRepository } from './infrastructure/prisma-expansion.repository.js';
import { PrismaRepresentationRepository } from './infrastructure/prisma-representation.repository.js';
import { PrismaTextReads } from './infrastructure/read/texts.read.js';
import { ReconcileSchedule } from './infrastructure/reconcile.schedule.js';
import { TextSearchModule } from './infrastructure/search/text-search.module.js';

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
        // take to publish the same message again; content queued again
        // meanwhile is mostly done already, the reconciler does the rest
        removeOnComplete: { age: DAY },
        removeOnFail: { age: 14 * DAY },
      },
    }),
    // the worker asks whether the database is up before blaming a plugin
    TerminusModule,
    StorageModule,
    PluginsModule,
    // with search off nothing is indexed, ProcessContent queues nothing and
    // SearchTexts answers it's off
    whenSearchOn(TextSearchModule),
  ],
  providers: [
    ListTexts,
    GetTextPage,
    ContentMembers,
    SearchTexts,
    Dispatch,
    DeliverMessage,
    ContentNames,
    ProcessContent,
    ExpandContent,
    Reconcile,
    PluginsWorker,
    ReconcileSchedule,
    {
      provide: RepresentationRepository,
      useClass: PrismaRepresentationRepository,
    },
    { provide: ExpansionRepository, useClass: PrismaExpansionRepository },
    { provide: FileFacts, useClass: CatalogFileFacts },
    { provide: TextReads, useClass: PrismaTextReads },
    { provide: PluginJobQueue, useClass: BullmqPluginJobQueue },
  ],
  // for PluginsOutboxTransport: the outbox makes it, with this module's
  // exports (AppModule wires it into messaging)
  exports: [Dispatch, PluginJobQueue],
})
export class ProcessingModule {}
