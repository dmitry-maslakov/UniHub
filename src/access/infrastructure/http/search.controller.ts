import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../../identity/contracts.js';
import { CourseSearch } from '../../application/course-search.js';
import {
  searchRequest,
  type SearchRequest,
} from '../../application/search-request.js';
import { Limited } from '../throttle.js';
import { SearchResponse } from './responses.js';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
@Limited('search')
export class SearchController {
  constructor(private readonly courses: CourseSearch) {}

  @Get()
  @ApiOkResponse({
    type: SearchResponse,
    description: 'files of your courses whose text matches, best first',
  })
  @ApiNotFoundResponse({ description: 'no course of yours by that slug' })
  @ApiServiceUnavailableResponse({ description: 'try again later' })
  search(
    @CurrentUserId() userId: string,
    @Query({ schema: searchRequest }) request: SearchRequest,
  ): Promise<SearchResponse> {
    return this.courses.search(userId, request);
  }
}
