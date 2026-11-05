import { UseFilters } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import { McpController, Tool } from '@rekog/mcp-nest';
import { CourseSearch } from '../../application/course-search.js';
import {
  searchRequest,
  type SearchRequest,
} from '../../application/search-request.js';
import { LimitedTool } from '../throttle.js';
import { McpErrorsFilter } from './mcp-errors.filter.js';
import { McpUserId } from './mcp-user-id.js';
import { json, readOnly } from './tool-results.js';

// The same search as GET /api/search, counted against the same limit
@McpController()
@UseFilters(McpErrorsFilter)
export class SearchTools {
  constructor(private readonly courses: CourseSearch) {}

  @Tool({
    name: 'search',
    description:
      "Search the text of files in the user's courses by words (Latin or Cyrillic, with or without diacritics), by code identifiers and, when the hub has an embedding model, by meaning. By meaning, up to `limit` files come back even when none has the words, the nearest first: a result doesn't prove the words are there, its snippets' highlights mark those found. Each result is a file with its best pages and snippets; read a page with read_file, giving its processor.",
    parameters: searchRequest,
    annotations: readOnly,
  })
  @LimitedTool('search')
  async search(@Payload() request: SearchRequest, @McpUserId() userId: string) {
    return json(await this.courses.search(userId, request));
  }
}
