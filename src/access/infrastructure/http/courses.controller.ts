import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CourseSlug } from '../../../catalog/contracts.js';
import { CurrentUserId } from '../../../identity/contracts.js';
import { CourseProcessing } from '../../application/course-processing.js';
import { CourseReader } from '../../application/course-reader.js';
import {
  courseFilesSchema,
  pageSchema,
  type FilesAt,
  type Page,
} from '../../application/page.js';
import { Limited } from '../throttle.js';
import {
  CourseProcessingResponse,
  CourseResponse,
  FileResponse,
  ItemResponse,
} from './responses.js';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
@Limited('api')
export class CoursesController {
  constructor(
    private readonly reader: CourseReader,
    private readonly processing: CourseProcessing,
  ) {}

  @Get()
  @ApiOkResponse({
    type: [CourseResponse],
    description: 'courses you may read',
  })
  list(@CurrentUserId() userId: string): Promise<CourseResponse[]> {
    return this.reader.courses(userId);
  }

  @Get(':slug/processing')
  @ApiOkResponse({
    type: CourseProcessingResponse,
    description:
      "how much of the course's files the processors have read; `waiting` counts contents, by kind",
  })
  @ApiNotFoundResponse()
  progress(
    @CurrentUserId() userId: string,
    @Param('slug', { schema: CourseSlug }) slug: CourseSlug,
  ): Promise<CourseProcessingResponse> {
    return this.processing.of(userId, slug);
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
  @ApiOkResponse({
    type: [FileResponse],
    description:
      'by folder and name; with `item`, only the files attached to that post',
  })
  @ApiNotFoundResponse()
  files(
    @CurrentUserId() userId: string,
    @Param('slug', { schema: CourseSlug }) slug: CourseSlug,
    @Query({ schema: courseFilesSchema }) page: FilesAt,
  ): Promise<FileResponse[]> {
    return this.reader.files(userId, slug, page);
  }
}
