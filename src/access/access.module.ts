import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { CourseReader } from './application/course-reader.js';
import { CoursesController } from './infrastructure/http/courses.controller.js';
import { FilesController } from './infrastructure/http/files.controller.js';
import { CourseTools } from './infrastructure/mcp/course.tools.js';
import { McpHttpController } from './infrastructure/mcp/mcp-http.controller.js';
import { McpRequestMiddleware } from './infrastructure/mcp/mcp-request.middleware.js';

// How users read the hub: the REST API and MCP. Every read goes through
// CourseReader, which checks the user's courses.
@Module({
  imports: [
    // named limits, each route's guard picks its own (throttleBy). One
    // budget per user across all a limit's routes. In one instance's
    // memory: there is one
    ThrottlerModule.forRoot([
      // REST, per signed-in user
      {
        name: 'api',
        ttl: 60_000,
        limit: 1200,
        generateKey: (_, tracker, name) => `${name}-${tracker}`,
        getTracker: (req) =>
          (req.user as { id: string } | null | undefined)?.id ?? req.ip,
      },
      // MCP, per user, however many keys they make
      {
        name: 'mcp',
        ttl: 60_000,
        limit: 600,
        generateKey: (_, tracker, name) => `${name}-${tracker}`,
        // a plain ThrottlerGuard runs every named limit, before sign-in too
        getTracker: (req) =>
          (req.user as { id: string } | null | undefined)?.id ?? req.ip,
      },
    ]),
  ],
  controllers: [
    CoursesController,
    FilesController,
    McpHttpController,
    CourseTools,
  ],
  providers: [CourseReader],
})
export class AccessModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(McpRequestMiddleware).forRoutes(McpHttpController);
  }
}
