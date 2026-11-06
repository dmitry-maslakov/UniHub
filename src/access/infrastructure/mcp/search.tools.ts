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
      "Search the user's courses: the text of their files, the files' names, the paths of files inside archives, and posts (announcements, pages), by words (Latin or Cyrillic, with or without diacritics), by code identifiers and, when the hub has an embedding model, the texts and posts by meaning too. By meaning, up to `limit` results come back even when none has the words, the best first: a result doesn't prove the words are there, its snippets' highlights mark those found. Each result has a `type`: a `file` with its best pages and snippets, a `member` (a file inside an archive, `member` its path in it), either with `matchedName` when its name or path matched; read a page with read_file, giving its processor and member. A `post` has its best snippet; open it with read_item.",
    parameters: searchRequest,
    annotations: readOnly,
  })
  @LimitedTool('search')
  async search(@Payload() request: SearchRequest, @McpUserId() userId: string) {
    return json(await this.courses.search(userId, request));
  }
}
