import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { CourseReader } from '../../application/course-reader.js';
import { Limit, Offset, page, Paged } from './paging.js';
import { CourseResponse, FileResponse, ItemResponse } from './responses.js';

@ApiTags('courses')
@ApiCookieAuth()
@ApiBearerAuth()
@Controller('api/courses')
export class CoursesController {
  constructor(private readonly reader: CourseReader) {}

  @Get()
  @ApiOkResponse({
    type: [CourseResponse],
    description: 'courses you may read',
  })
  list(@Session() session: UserSession) {
    return this.reader.courses(session.user.id);
  }

  @Get(':slug/items')
  @ApiOkResponse({ type: [ItemResponse], description: 'newest first' })
  @Paged()
  @ApiNotFoundResponse()
  async items(
    @Session() session: UserSession,
    @Param('slug') slug: string,
    @Offset() offset: number,
    @Limit() limit: number,
  ) {
    const items = await this.reader.items(
      session.user.id,
      slug,
      page(offset, limit),
    );
    if (!items) throw new NotFoundException();
    return items;
  }

  @Get(':slug/files')
  @ApiOkResponse({ type: [FileResponse], description: 'by folder and name' })
  @Paged()
  @ApiNotFoundResponse()
  async files(
    @Session() session: UserSession,
    @Param('slug') slug: string,
    @Offset() offset: number,
    @Limit() limit: number,
  ) {
    const files = await this.reader.files(
      session.user.id,
      slug,
      page(offset, limit),
    );
    if (!files) throw new NotFoundException();
    return files;
  }
}
