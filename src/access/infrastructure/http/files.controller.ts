import {
  Controller,
  Get,
  Header,
  NotFoundException,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { create as contentDisposition } from 'content-disposition';
import { CurrentUserId } from '../../../identity/contracts.js';
import { CourseReader } from '../../application/course-reader.js';
import { PageNumber } from './paging.js';
import { FileDetailsResponse, TextPageResponse } from './responses.js';

// the portal's mime type, if it is a plain type/subtype a header can carry
const TOKEN = "[!#$%&'*+.^_`|~0-9a-z-]+";
const MIME = new RegExp(`^${TOKEN}/${TOKEN}$`, 'i');
const contentType = (mime: string | null) => {
  const type = mime?.split(';')[0].trim();
  return type && MIME.test(type) ? type : 'application/octet-stream';
};

@ApiTags('files')
@ApiBearerAuth()
@ApiNotFoundResponse()
@Controller('files')
export class FilesController {
  constructor(private readonly reader: CourseReader) {}

  @Get(':id')
  @ApiOkResponse({ type: FileDetailsResponse })
  async file(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FileDetailsResponse> {
    const file = await this.reader.file(userId, id);
    if (!file) throw new NotFoundException();
    return file;
  }

  @Get(':id/text')
  @ApiOkResponse({
    type: TextPageResponse,
    description: 'one page, slide or section of the text made from the file',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({
    name: 'processor',
    required: false,
    description: 'which text, the first one by default',
  })
  async text(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @PageNumber() page: number,
    @Query('processor') processor?: string,
  ): Promise<TextPageResponse> {
    const text = await this.reader.text(userId, id, page, processor);
    if (!text) throw new NotFoundException();
    return text;
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
    if (!file) throw new NotFoundException();
    return new StreamableFile(file.stream, {
      type: contentType(file.mime),
      disposition: contentDisposition(file.name),
    });
  }
}
