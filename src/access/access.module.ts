import { Module } from '@nestjs/common';
import { CourseReader } from './application/course-reader.js';
import { CoursesController } from './infrastructure/http/courses.controller.js';
import { FilesController } from './infrastructure/http/files.controller.js';

// How users read the hub: the REST API now, MCP later. Every read goes
// through CourseReader, which checks the user's courses.
@Module({
  controllers: [CoursesController, FilesController],
  providers: [CourseReader],
})
export class AccessModule {}
