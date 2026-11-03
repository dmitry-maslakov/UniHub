import { Module } from '@nestjs/common';
import { CourseReader } from './application/course-reader.js';
import { CoursesController } from './infrastructure/http/courses.controller.js';
import { FilesController } from './infrastructure/http/files.controller.js';
import { CourseTools } from './infrastructure/mcp/course.tools.js';
import { McpHttpController } from './infrastructure/mcp/mcp-http.controller.js';

// How users read the hub: the REST API and MCP. Every read goes through
// CourseReader, which checks the user's courses.
@Module({
  controllers: [
    CoursesController,
    FilesController,
    McpHttpController,
    CourseTools,
  ],
  providers: [CourseReader],
})
export class AccessModule {}
