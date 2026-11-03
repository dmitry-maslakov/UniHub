import { Global, Module } from '@nestjs/common';
import { Ingest } from '@app/plugin-sdk';
import { HubIngest } from './application/hub-ingest.js';
import { IngestCourseHandler } from './application/commands/ingest-course.handler.js';
import { IngestFileContentHandler } from './application/commands/ingest-file-content.handler.js';
import { IngestFileHandler } from './application/commands/ingest-file.handler.js';
import { IngestItemHandler } from './application/commands/ingest-item.handler.js';
import { SaveSyncStateHandler } from './application/commands/save-sync-state.handler.js';
import { GetSyncStateHandler } from './application/queries/get-sync-state.handler.js';
import { SyncStateRepository } from './domain/sync-state.js';
import { PrismaSyncStateRepository } from './infrastructure/prisma-sync-state.repository.js';

// the single way in for data from plugins, whatever transport they use
@Global()
@Module({
  providers: [
    { provide: Ingest, useClass: HubIngest },
    { provide: SyncStateRepository, useClass: PrismaSyncStateRepository },
    IngestCourseHandler,
    IngestItemHandler,
    IngestFileHandler,
    IngestFileContentHandler,
    SaveSyncStateHandler,
    GetSyncStateHandler,
  ],
  exports: [Ingest],
})
export class IngestModule {}
