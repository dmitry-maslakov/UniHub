import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CourseSlug } from '../../../catalog/contracts.js';
import { CurrentUserId } from '../../../identity/contracts.js';
import { CourseProcessing } from '../../application/course-processing.js';
import { CourseReader } from '../../application/course-reader.js';
import { CourseShowing } from '../../application/course-showing.js';
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
    private readonly showing: CourseShowing,
  ) {}

  @Get()
  @ApiOkResponse({
    type: [CourseResponse],
    description:
      "your courses, those you hide too (`hidden`). You read every public portal's course as well, by its slug and by search: one is here once you pick it",
  })
  list(@CurrentUserId() userId: string): Promise<CourseResponse[]> {
    return this.reader.courses(userId);
  }

  @Get(':slug')
  @ApiOkResponse({
    type: CourseResponse,
    description:
      "one course you read, yours or not: a public portal's you didn't pick too",
  })
  @ApiNotFoundResponse()
  course(
    @CurrentUserId() userId: string,
    @Param('slug', { schema: CourseSlug }) slug: CourseSlug,
  ): Promise<CourseResponse> {
    return this.reader.course(userId, slug);
  }

  @Put(':slug/hidden')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description:
      'hidden: left out of your courses, and read as before by every route, search and MCP',
  })
  @ApiNotFoundResponse()
  async hide(
    @CurrentUserId() userId: string,
    @Param('slug', { schema: CourseSlug }) slug: CourseSlug,
  ) {
    await this.showing.hide(userId, slug);
  }

  @Delete(':slug/hidden')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description:
      "shown among your courses: one you hid, or a public portal's you didn't pick, which picks it",
  })
  @ApiNotFoundResponse()
  async show(
    @CurrentUserId() userId: string,
    @Param('slug', { schema: CourseSlug }) slug: CourseSlug,
  ) {
    await this.showing.show(userId, slug);
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
