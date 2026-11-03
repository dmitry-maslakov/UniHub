import { Module } from '@nestjs/common';
import { SetFileContentHandler } from './application/commands/set-file-content.handler.js';
import { UpsertFileHandler } from './application/commands/upsert-file.handler.js';
import { UpsertItemHandler } from './application/commands/upsert-item.handler.js';
import { UpsertPortalCourseHandler } from './application/commands/upsert-portal-course.handler.js';
import { FileRepository } from './domain/file.js';
import { ItemRepository } from './domain/item.js';
import { PortalCourseRepository } from './domain/portal-course.js';
import { PrismaFileRepository } from './infrastructure/prisma-file.repository.js';
import { PrismaItemRepository } from './infrastructure/prisma-item.repository.js';
import { PrismaPortalCourseRepository } from './infrastructure/prisma-portal-course.repository.js';

@Module({
  providers: [
    { provide: PortalCourseRepository, useClass: PrismaPortalCourseRepository },
    { provide: ItemRepository, useClass: PrismaItemRepository },
    { provide: FileRepository, useClass: PrismaFileRepository },
    UpsertPortalCourseHandler,
    UpsertItemHandler,
    UpsertFileHandler,
    SetFileContentHandler,
  ],
})
export class CatalogModule {}
