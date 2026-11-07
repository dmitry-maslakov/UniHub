import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { roleConfig } from '../../../platform/role/role.config.js';
import { opensearchConfig } from '../../../platform/search/opensearch.config.js';
import { OpenSearchModule } from '../../../platform/search/opensearch.module.js';
import { PluginsModule } from '../../../plugins/contracts.js';
import { IndexRecord } from '../../application/index-record.js';
import { IndexText } from '../../application/index-text.js';
import {
  Embedder,
  FileFacts,
  PostFacts,
  QueryEmbedder,
  Reranker,
  TextIndex,
  TextIndexQueue,
} from '../../application/ports.js';
import { ReconcileIndex } from '../../application/reconcile-index.js';
import { RepresentationRepository } from '../../domain/representation.js';
import { UnpackingRepository } from '../../domain/unpacking.js';
import { textSearchConfig } from '../../text-search.config.js';
import { CatalogFileFacts } from '../catalog-file-facts.js';
import { CatalogPostFacts } from '../catalog-post-facts.js';
import { HtmlTextModule } from '../html-text.module.js';
import { PrismaRepresentationRepository } from '../prisma-representation.repository.js';
import { PrismaUnpackingRepository } from '../prisma-unpacking.repository.js';
import { BullmqTextIndexQueue } from './bullmq-text-index-queue.js';
import { OpenSearchTextIndex } from './opensearch-text-index.js';
import { ReconcileIndexSchedule } from './reconcile-index.schedule.js';
import { SEARCH_INDEX_QUEUE } from './search-index.queue.js';
import { SearchIndexWorker } from './search-index.worker.js';
import { PASSAGE_TIMEOUT, QUERY_TIMEOUT, TeiEmbedder } from './tei-embedder.js';
import { TeiReranker } from './tei-reranker.js';

const DAY = 24 * 60 * 60;

// The processors' texts in OpenSearch, and the records (posts, files' names,
// trees' paths), kept in step with postgres. Imported only when search is
// on (processing.module.ts).
@Module({
  imports: [
    ConfigModule.forFeature(opensearchConfig),
    ConfigModule.forFeature(textSearchConfig),
    ConfigModule.forFeature(roleConfig),
    OpenSearchModule,
    // IndexRecord reads posts' HTML
    HtmlTextModule,
    // the worker asks whether the database is up before blaming a job
    TerminusModule,
    // ReconcileIndex queues only the texts of the processors on
    PluginsModule,
    BullModule.registerQueue({
      name: SEARCH_INDEX_QUEUE,
      defaultJobOptions: {
        // a job tried again writes the same documents (ids of its key)
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        // the same key enqueued meanwhile is dropped; ReconcileIndex queues
        // what the index lacks whenever it runs
        removeOnComplete: { age: DAY },
        removeOnFail: { age: 14 * DAY },
      },
    }),
  ],
  providers: [
    // its own: importing ProcessingModule here would be a cycle
    {
      provide: RepresentationRepository,
      useClass: PrismaRepresentationRepository,
    },
    { provide: UnpackingRepository, useClass: PrismaUnpackingRepository },
    { provide: FileFacts, useClass: CatalogFileFacts },
    { provide: PostFacts, useClass: CatalogPostFacts },
    { provide: TextIndex, useClass: OpenSearchTextIndex },
    { provide: TextIndexQueue, useClass: BullmqTextIndexQueue },
    // null without EMBEDDING_URL: BM25 only
    {
      provide: Embedder,
      inject: [textSearchConfig.KEY],
      useFactory: ({ embedding }: ConfigType<typeof textSearchConfig>) =>
        embedding && new TeiEmbedder(embedding, embedding.url, PASSAGE_TIMEOUT),
    },
    {
      provide: QueryEmbedder,
      inject: [textSearchConfig.KEY],
      useFactory: ({ embedding }: ConfigType<typeof textSearchConfig>) =>
        embedding &&
        new TeiEmbedder(embedding, embedding.queryUrl, QUERY_TIMEOUT),
    },
    // null without RERANK_URL: the index's order
    {
      provide: Reranker,
      inject: [textSearchConfig.KEY],
      useFactory: ({ rerank }: ConfigType<typeof textSearchConfig>) =>
        rerank && new TeiReranker(rerank),
    },
    IndexText,
    IndexRecord,
    ReconcileIndex,
    SearchIndexWorker,
    ReconcileIndexSchedule,
  ],
  // to ProcessContent and SearchTexts, which do without them when it's off
  exports: [TextIndex, TextIndexQueue, QueryEmbedder, Reranker],
})
export class TextSearchModule {}
