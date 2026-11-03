import { Module } from '@nestjs/common';
import { RemoveFileHandler } from './application/commands/remove-file.handler.js';
import { RemoveItemHandler } from './application/commands/remove-item.handler.js';
import { ListFilesWithContentHandler } from './application/queries/list-files-with-content.handler.js';
import { GetItemHandler } from './application/queries/get-item.handler.js';
import { GetPortalCourseHandler } from './application/queries/get-portal-course.handler.js';
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
    RemoveItemHandler,
    RemoveFileHandler,
    GetPortalCourseHandler,
    GetItemHandler,
    GetFileHandler,
    FindFileHandler,
    ListFilesWithContentHandler,
  ],
})
export class CatalogModule {}
