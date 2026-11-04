import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
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

// How users read the hub, the REST API and MCP, and how admins say who reads
// which course. Over catalog and identity: every read goes through
// CourseReader, every grant through CourseGrants.
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
