import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CourseSlug } from '../../../catalog/contracts.js';
import { CurrentUserId } from '../../../identity/contracts.js';
import { CourseReader } from '../../application/course-reader.js';
import { pageSchema, type Page } from '../../application/page.js';
import { Limited } from '../throttle.js';
import { CourseResponse, FileResponse, ItemResponse } from './responses.js';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
@Limited('api')
export class CoursesController {
  constructor(private readonly reader: CourseReader) {}

  @Get()
  @ApiOkResponse({
    type: [CourseResponse],
    description: 'courses you may read',
  })
  list(@CurrentUserId() userId: string): Promise<CourseResponse[]> {
    return this.reader.courses(userId);
  }

  @Get(':slug/items')
  @ApiOkResponse({ type: [ItemResponse], description: 'newest first' })
  @ApiNotFoundResponse()
  items(
    @CurrentUserId() userId: string,
    @Param('slug', { schema: CourseSlug }) slug: CourseSlug,
    @Query({ schema: pageSchema }) page: Page,
  ): Promise<ItemResponse[]> {
    return this.reader.items(userId, slug, page);
  }

  @Get(':slug/files')
  @ApiOkResponse({ type: [FileResponse], description: 'by folder and name' })
  @ApiNotFoundResponse()
  files(
    @CurrentUserId() userId: string,
    @Param('slug', { schema: CourseSlug }) slug: CourseSlug,
    @Query({ schema: pageSchema }) page: Page,
  ): Promise<FileResponse[]> {
    return this.reader.files(userId, slug, page);
  }
}
