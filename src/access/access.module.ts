import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { CourseReader } from './application/course-reader.js';
import { CoursesController } from './infrastructure/http/courses.controller.js';
import { FilesController } from './infrastructure/http/files.controller.js';
import { CourseTools } from './infrastructure/mcp/course.tools.js';
import { McpHttpController } from './infrastructure/mcp/mcp-http.controller.js';

// How users read the hub: the REST API and MCP. Every read goes through
// CourseReader, which checks the user's courses.
@Module({
  imports: [
    // MCP calls per key (or user) and minute; one instance's memory for now
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
  ],
  controllers: [
    CoursesController,
    FilesController,
    McpHttpController,
    CourseTools,
  ],
  providers: [CourseReader],
})
export class AccessModule {}
