import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ConditionalModule } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { IdentityModule } from '../identity/contracts.js';
import { StorageModule } from '../storage/contracts.js';
import { CourseGrants } from './application/course-grants.js';
import { CourseReader } from './application/course-reader.js';
import { CourseAccessController } from './infrastructure/http/course-access.controller.js';
import { CoursesController } from './infrastructure/http/courses.controller.js';
import { FilesController } from './infrastructure/http/files.controller.js';
import { CourseTools } from './infrastructure/mcp/course.tools.js';
import { McpHttpController } from './infrastructure/mcp/mcp-http.controller.js';
import { McpRequestMiddleware } from './infrastructure/mcp/mcp-request.middleware.js';
import { throttlerOptions } from './infrastructure/throttle.js';
import { AccessSearchModule } from './search.module.js';

// How users read the hub, the REST API and MCP, and how admins say who reads
// which course. Over catalog and identity: every read goes through
// CourseReader, every search through CourseSearch, every grant through
// CourseGrants.
@Module({
  imports: [
    // the named limits routes take with @Limited()
    ThrottlerModule.forRootAsync({
      inject: [Reflector],
      useFactory: throttlerOptions,
    }),
    // MCP's @ApiKeyAuth() guard authenticates through it
    IdentityModule,
    StorageModule,
    // with OPENSEARCH_URL, as processing's index; the function form, as a
    // string one would load the module when the variable isn't set
    ConditionalModule.registerWhen(AccessSearchModule, (env) =>
      Boolean(env.OPENSEARCH_URL),
    ),
  ],
  controllers: [
    CoursesController,
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
