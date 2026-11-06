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
import { CourseReader } from './application/course-reader.js';
import { CourseAccessController } from './infrastructure/http/course-access.controller.js';
import { CoursesController } from './infrastructure/http/courses.controller.js';
import { FilesController } from './infrastructure/http/files.controller.js';
import { ItemsController } from './infrastructure/http/items.controller.js';
import { CourseTools } from './infrastructure/mcp/course.tools.js';
import { McpHttpController } from './infrastructure/mcp/mcp-http.controller.js';
import { McpRequestMiddleware } from './infrastructure/mcp/mcp-request.middleware.js';
import { throttlerOptions } from './infrastructure/throttle.js';
import { AccessSearchModule } from './search.module.js';

// How users read the hub, the REST API and MCP, and how admins say who reads
// which course. Over catalog, identity and accounts: every read goes
// through CourseReader, every search through CourseSearch, both cut to the
// user's viewers, every grant through CourseGrants.
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
    CourseAccessController,
    McpHttpController,
    CourseTools,
  ],
  providers: [CourseReader, CourseGrants],
})
export class AccessModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(McpRequestMiddleware).forRoutes(McpHttpController);
  }
}
