import {
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { CourseReader } from '../../application/course-reader.js';
import { FileDetailsResponse, TextPageResponse } from './responses.js';

// RFC 6266: an ascii fallback plus the real (often non-ascii) name
const attachment = (name: string) =>
  `attachment; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; ` +
  `filename*=UTF-8''${encodeURIComponent(name)}`;

@ApiTags('files')
@ApiCookieAuth()
@ApiBearerAuth()
@ApiNotFoundResponse()
@Controller('api/files')
export class FilesController {
  constructor(private readonly reader: CourseReader) {}

  @Get(':id')
  @ApiOkResponse({ type: FileDetailsResponse })
  async file(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const file = await this.reader.file(session.user.id, id);
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
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('processor') processor?: string,
  ) {
    const text = await this.reader.text(session.user.id, id, page, processor);
    if (!text) throw new NotFoundException();
    return text;
  }

  @Get(':id/content')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'the file as the portal had it' })
  async content(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const file = await this.reader.content(session.user.id, id);
    if (!file) throw new NotFoundException();
    return new StreamableFile(file.stream, {
      type: file.mime ?? 'application/octet-stream',
      disposition: attachment(file.name),
    });
  }
}
