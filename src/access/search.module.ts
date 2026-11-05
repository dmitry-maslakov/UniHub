import { Module } from '@nestjs/common';
import { CourseSearch } from './application/course-search.js';
import { SearchController } from './infrastructure/http/search.controller.js';
import { SearchTools } from './infrastructure/mcp/search.tools.js';

// Search over what a user may read, as a route and a tool. Imported only
// when search is on (access.module.ts): otherwise the route is a 404 and the
// tool isn't listed.
@Module({
  controllers: [SearchController, SearchTools],
  providers: [CourseSearch],
})
export class AccessSearchModule {}
