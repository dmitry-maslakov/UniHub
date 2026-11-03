import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../../identity/contracts.js';
import { CourseReader } from '../../application/course-reader.js';
import { Limit, Offset, Paged } from './paging.js';
import { CourseResponse, FileResponse, ItemResponse } from './responses.js';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('api/courses')
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
  @Paged()
  async items(
    @CurrentUserId() userId: string,
    @Param('slug') slug: string,
    @Offset() offset: number,
    @Limit() limit: number,
  ): Promise<ItemResponse[]> {
    const items = await this.reader.items(userId, slug, { offset, limit });
    if (!items) throw new NotFoundException();
    return items;
  }

  @Get(':slug/files')
  @ApiOkResponse({ type: [FileResponse], description: 'by folder and name' })
  @ApiNotFoundResponse()
  @Paged()
  async files(
    @CurrentUserId() userId: string,
    @Param('slug') slug: string,
    @Offset() offset: number,
    @Limit() limit: number,
  ): Promise<FileResponse[]> {
    const files = await this.reader.files(userId, slug, { offset, limit });
    if (!files) throw new NotFoundException();
    return files;
  }
}
