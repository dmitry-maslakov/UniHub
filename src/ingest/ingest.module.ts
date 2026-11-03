import { Module } from '@nestjs/common';
import { IngestCourseHandler } from './application/commands/ingest-course.handler.js';
import { IngestFileContentHandler } from './application/commands/ingest-file-content.handler.js';
import { IngestFileHandler } from './application/commands/ingest-file.handler.js';
import { IngestItemHandler } from './application/commands/ingest-item.handler.js';
import { SaveSyncStateHandler } from './application/commands/save-sync-state.handler.js';
import { GetSyncStateHandler } from './application/queries/get-sync-state.handler.js';
import { SyncStateRepository } from './domain/sync-state.js';
import { PrismaSyncStateRepository } from './infrastructure/prisma-sync-state.repository.js';

// the single way in for data from plugins, whatever transport they use
@Module({
  providers: [
    { provide: SyncStateRepository, useClass: PrismaSyncStateRepository },
    IngestCourseHandler,
    IngestItemHandler,
    IngestFileHandler,
    IngestFileContentHandler,
    SaveSyncStateHandler,
    GetSyncStateHandler,
  ],
})
export class IngestModule {}
