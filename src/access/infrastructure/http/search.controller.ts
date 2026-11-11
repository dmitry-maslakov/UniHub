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
  restSearchRequest,
  type RestSearchRequest,
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
    description:
      'files and posts of the courses you read whose text matches, best first; with search by meaning on, up to `limit` even when none has the words, the nearest by meaning',
  })
  @ApiNotFoundResponse({ description: 'no course of yours by that slug' })
  @ApiServiceUnavailableResponse({ description: 'try again later' })
  search(
    @CurrentUserId() userId: string,
    @Query({ schema: restSearchRequest }) request: RestSearchRequest,
  ): Promise<SearchResponse> {
    return this.courses.search(userId, request);
  }
}
