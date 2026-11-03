import { Module } from '@nestjs/common';
import { SetFileContentHandler } from './application/commands/set-file-content.handler.js';
import { UpsertFileHandler } from './application/commands/upsert-file.handler.js';
import { UpsertItemHandler } from './application/commands/upsert-item.handler.js';
import { UpsertPortalCourseHandler } from './application/commands/upsert-portal-course.handler.js';
import { FindFileHandler } from './application/queries/find-file.handler.js';
import { GetFileHandler } from './application/queries/get-file.handler.js';
import { CatalogEvents } from './domain/events.js';
import { FileRepository } from './domain/file.js';
import { ItemRepository } from './domain/item.js';
import { PortalCourseRepository } from './domain/portal-course.js';
import { OutboxCatalogEvents } from './infrastructure/outbox-catalog-events.js';
import { PrismaFileRepository } from './infrastructure/prisma-file.repository.js';
import { PrismaItemRepository } from './infrastructure/prisma-item.repository.js';
import { PrismaPortalCourseRepository } from './infrastructure/prisma-portal-course.repository.js';

@Module({
  providers: [
    { provide: PortalCourseRepository, useClass: PrismaPortalCourseRepository },
    { provide: ItemRepository, useClass: PrismaItemRepository },
    { provide: FileRepository, useClass: PrismaFileRepository },
    { provide: CatalogEvents, useClass: OutboxCatalogEvents },
    UpsertPortalCourseHandler,
    UpsertItemHandler,
    UpsertFileHandler,
    SetFileContentHandler,
    GetFileHandler,
    FindFileHandler,
  ],
})
export class CatalogModule {}
