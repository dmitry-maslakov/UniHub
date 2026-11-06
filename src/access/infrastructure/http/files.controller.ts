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
import {
  memberSchema,
  pageSchema,
  textPageSchema,
  type Page,
  type TextAt,
} from '../../application/page.js';
import { Limited } from '../throttle.js';
import {
  FileDetailsResponse,
  MemberResponse,
  TextPageResponse,
} from './responses.js';

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

  @Get(':id/members')
  @ApiOkResponse({
    type: [MemberResponse],
    description:
      'the files inside an archive (zip, tar, gz) the file is, in the order it lists them; none for another file',
  })
  members(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query({ schema: pageSchema }) page: Page,
  ): Promise<MemberResponse[]> {
    return this.reader.members(userId, id, page);
  }

  @Get(':id/text')
  @ApiOkResponse({
    type: TextPageResponse,
    description:
      'one page, slide or section of the text made from the file, or from a file inside it',
  })
  text(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query({ schema: textPageSchema }) at: TextAt,
  ): Promise<TextPageResponse> {
    return this.reader.text(userId, id, at);
  }

  @Get(':id/content')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({
    description:
      'the file as the portal had it, or a file inside it as its archive had it',
  })
  // the type is the portal's word, or the archive's; a browser must not
  // guess another
  @Header('X-Content-Type-Options', 'nosniff')
  async content(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query({ schema: memberSchema })
    { member }: z.output<typeof memberSchema>,
  ) {
    const file = await this.reader.content(userId, id, member);
    return new StreamableFile(file.stream, {
      // a media type's essence is type/subtype, which a header carries
      type: file.mime ?? 'application/octet-stream',
      disposition: contentDisposition(file.name),
    });
  }
}
