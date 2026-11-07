import { Module } from '@nestjs/common';
import {
  CreateCourseHandler,
  LinkPortalCourseHandler,
  UnlinkPortalCourseHandler,
} from './application/course.handlers.js';
import {
  RemoveFileHandler,
  SetFileContentHandler,
  UpsertFileHandler,
} from './application/file.handlers.js';
import {
  RemoveItemHandler,
  UpsertItemHandler,
} from './application/item.handlers.js';
import { AdoptRecordsHandler } from './application/instance.handlers.js';
import { UpsertPortalCourseHandler } from './application/portal-course.handlers.js';
import { References } from './application/references.js';
import {
  ForgetAccountHandler,
  StoreBytesHandler,
  ViewCourseHandler,
  ViewCoursesHandler,
} from './application/view.handlers.js';
import { CourseLinkRepository } from './domain/course-link/course-link.repository.js';
import { CourseRepository } from './domain/course/course.repository.js';
import { Instances } from './domain/instances.js';
import { ItemRepository } from './domain/item/item.repository.js';
import { PortalCourseRepository } from './domain/portal-course/portal-course.repository.js';
import { PortalFileRepository } from './domain/portal-file/portal-file.repository.js';
import { ViewRepository } from './domain/view/view.repository.js';
import { CoursesAdminController } from './infrastructure/http/courses-admin.controller.js';
import { PrismaCourseLinkRepository } from './infrastructure/prisma-course-link.repository.js';
import { PrismaCourseRepository } from './infrastructure/prisma-course.repository.js';
import { PrismaInstances } from './infrastructure/prisma-instances.js';
import { PrismaItemRepository } from './infrastructure/prisma-item.repository.js';
import { PrismaPortalCourseRepository } from './infrastructure/prisma-portal-course.repository.js';
import { PrismaPortalFileRepository } from './infrastructure/prisma-portal-file.repository.js';
import { PrismaViewRepository } from './infrastructure/prisma-view.repository.js';
import {
  ListPortalCatalogHandler,
  ListSharedPortalCoursesHandler,
} from './infrastructure/read/catalog.read.js';
import {
  FindCourseHandler,
  GetPortalCourseHandler,
  ListCoursesHandler,
  ListHubCoursesHandler,
} from './infrastructure/read/courses.read.js';
import {
  FindFileHandler,
  GetCourseFileHandler,
  GetFileHandler,
  ListCourseFilesHandler,
  ListFilesOfContentHandler,
  ListFilesWithContentHandler,
  ListVisibleContentHandler,
} from './infrastructure/read/files.read.js';
import {
  GetCourseItemHandler,
  GetItemHandler,
  ListCourseItemsHandler,
  ListItemsHandler,
  ListVisibleItemsHandler,
} from './infrastructure/read/items.read.js';
import { HasBytesHandler } from './infrastructure/read/views.read.js';

// What portals publish (written by ingest), kept as versions that accounts
// see through sights, and the courses admins make of it. The shared
// account's records go through the aggregates, users' accounts' views
// through ViewRepository; queries read the database straight into what
// other modules get, cut to the viewers they're given.
@Module({
  controllers: [CoursesAdminController],
  providers: [
    { provide: PortalCourseRepository, useClass: PrismaPortalCourseRepository },
    { provide: ItemRepository, useClass: PrismaItemRepository },
    { provide: PortalFileRepository, useClass: PrismaPortalFileRepository },
    { provide: CourseRepository, useClass: PrismaCourseRepository },
    { provide: CourseLinkRepository, useClass: PrismaCourseLinkRepository },
    { provide: ViewRepository, useClass: PrismaViewRepository },
    { provide: Instances, useClass: PrismaInstances },
    References,
    UpsertPortalCourseHandler,
    UpsertItemHandler,
    RemoveItemHandler,
    UpsertFileHandler,
    SetFileContentHandler,
    RemoveFileHandler,
    CreateCourseHandler,
    LinkPortalCourseHandler,
    UnlinkPortalCourseHandler,
    ViewCoursesHandler,
    ViewCourseHandler,
    StoreBytesHandler,
    ForgetAccountHandler,
    AdoptRecordsHandler,
    HasBytesHandler,
    ListCoursesHandler,
    ListHubCoursesHandler,
    FindCourseHandler,
    GetPortalCourseHandler,
    ListCourseItemsHandler,
    GetCourseItemHandler,
    ListVisibleItemsHandler,
    GetItemHandler,
    ListItemsHandler,
    ListCourseFilesHandler,
    GetCourseFileHandler,
    ListVisibleContentHandler,
    GetFileHandler,
    FindFileHandler,
    ListFilesOfContentHandler,
    ListFilesWithContentHandler,
    ListPortalCatalogHandler,
    ListSharedPortalCoursesHandler,
  ],
})
export class CatalogModule {}
