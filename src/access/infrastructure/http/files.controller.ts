import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { create as contentDisposition } from 'content-disposition';
import type { z } from 'zod';
import { CurrentUserId } from '../../../identity/contracts.js';
import { CourseReader } from '../../application/course-reader.js';
import { Limited } from '../throttle.js';
import { textQuery } from './requests.js';
import { FileDetailsResponse, TextPageResponse } from './responses.js';

@ApiTags('files')
@ApiBearerAuth()
@ApiNotFoundResponse()
@Controller('files')
@Limited('api')
export class FilesController {
  constructor(private readonly reader: CourseReader) {}

  @Get(':id')
  @ApiOkResponse({ type: FileDetailsResponse })
  file(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FileDetailsResponse> {
    return this.reader.file(userId, id);
  }

  @Get(':id/text')
  @ApiOkResponse({
    type: TextPageResponse,
    description: 'one page, slide or section of the text made from the file',
  })
  text(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query({ schema: textQuery })
    { page, processor }: z.output<typeof textQuery>,
  ): Promise<TextPageResponse> {
    return this.reader.text(userId, id, page, processor);
  }

  @Get(':id/content')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'the file as the portal had it' })
  // the type is the portal's word; a browser must not guess another
  @Header('X-Content-Type-Options', 'nosniff')
  async content(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const file = await this.reader.content(userId, id);
    return new StreamableFile(file.stream, {
      // a media type's essence is type/subtype, which a header carries
      type: file.mime ?? 'application/octet-stream',
      disposition: contentDisposition(file.name),
    });
  }
}
