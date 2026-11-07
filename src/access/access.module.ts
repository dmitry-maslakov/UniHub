import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { IdentityModule } from '../identity/contracts.js';
import { whenSearchOn } from '../platform/search/opensearch.config.js';
import { StorageModule } from '../storage/contracts.js';
import { CourseGrants } from './application/course-grants.js';
import { CourseMatching } from './application/course-matching.js';
import { CourseReader } from './application/course-reader.js';
import { Downloads } from './application/downloads.js';
import { HubCourses } from './application/hub-courses.js';
import {
  OwnPortalCourseHandler,
  PickMatchesHandler,
} from './application/matching.handlers.js';
import { DownloadRequests } from './domain/download-requests.js';
import { CourseAccessController } from './infrastructure/http/course-access.controller.js';
import { CoursesController } from './infrastructure/http/courses.controller.js';
import { DownloadsController } from './infrastructure/http/downloads.controller.js';
import { FilesController } from './infrastructure/http/files.controller.js';
import { HubCoursesController } from './infrastructure/http/hub-courses.controller.js';
import { ItemsController } from './infrastructure/http/items.controller.js';
import { CourseTools } from './infrastructure/mcp/course.tools.js';
import { McpHttpController } from './infrastructure/mcp/mcp-http.controller.js';
import { McpRequestMiddleware } from './infrastructure/mcp/mcp-request.middleware.js';
import { RedisDownloadRequests } from './infrastructure/redis-download-requests.js';
import { throttlerOptions } from './infrastructure/throttle.js';
import { AccessSearchModule } from './search.module.js';

// How users read the hub, the REST API and MCP, and how admins say who reads
// which course. Over catalog, identity and accounts: every read goes
// through CourseReader, every search through CourseSearch, both cut to the
// user's viewers and their courses grouped as they see them, every grant
// through CourseGrants. Answers accounts which course of a user's own a
// pick goes with (CourseMatching).
@Module({
  imports: [
    // the named limits routes take with @Limited()
    ThrottlerModule.forRootAsync({
      inject: [Reflector],
      useFactory: throttlerOptions,
    }),
    // MCP's @McpAuth() guard authenticates through it, and its Origin check
    // takes the hub's trusted origins
    IdentityModule,
    StorageModule,
    // the search route and tool, with processing's index
    whenSearchOn(AccessSearchModule),
  ],
  controllers: [
    CoursesController,
    ItemsController,
    FilesController,
    DownloadsController,
    CourseAccessController,
    HubCoursesController,
    McpHttpController,
    CourseTools,
  ],
  providers: [
    CourseReader,
    Downloads,
    { provide: DownloadRequests, useClass: RedisDownloadRequests },
    CourseGrants,
    HubCourses,
    CourseMatching,
    OwnPortalCourseHandler,
    PickMatchesHandler,
  ],
})
export class AccessModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(McpRequestMiddleware).forRoutes(McpHttpController);
  }
}
