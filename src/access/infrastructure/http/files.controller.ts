import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { create as contentDisposition } from 'content-disposition';
import type { Response } from 'express';
import { CurrentUserId } from '../../../identity/contracts.js';
import { CourseReader } from '../../application/course-reader.js';
import {
  contentSchema,
  pageSchema,
  textPageSchema,
  viewSchema,
  type ContentAt,
  type Page,
  type TextAt,
  type ViewAt,
} from '../../application/page.js';
import { opensInline } from '../../application/inline.js';
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
export class FilesController {
  constructor(private readonly reader: CourseReader) {}

  @Get(':id')
  @Limited('api')
  @ApiOkResponse({ type: FileDetailsResponse })
  file(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FileDetailsResponse> {
    return this.reader.file(userId, id);
  }

  @Get(':id/members')
  @Limited('api')
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
  @Limited('api')
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
  @Limited('api')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({
    description:
      'the file as the portal had it, or a file inside it as its archive had it; a download, unless `disposition=inline` asks to show a PDF, picture or plain text in the browser',
  })
  // the type is the portal's word, or the archive's; a browser must not
  // guess another
  @Header('X-Content-Type-Options', 'nosniff')
  async content(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query({ schema: contentSchema }) { member, disposition }: ContentAt,
  ) {
    const file = await this.reader.content(userId, id, member);
    return new StreamableFile(file.stream, {
      // a media type's essence is type/subtype, which a header carries
      type: file.mime ?? 'application/octet-stream',
      // inline only when asked and only for what a browser shows without
      // running anything of the file's (HTML, SVG and Office files never)
      disposition: contentDisposition(file.name, {
        type:
          disposition === 'inline' && opensInline(file.mime)
            ? 'inline'
            : 'attachment',
      }),
    });
  }

  @Get(':id/view')
  @Limited('views')
  @ApiProduces('image/jpeg')
  @ApiOkResponse({
    description:
      'the file as a picture: a JPEG of an image, or of one page of a PDF (`page`, from 1; `X-Page-Count` says how many it has), at most 1568 pixels on a side. A PDF page past the last is not found; a file that is neither an image nor a PDF, or is too large, is 422 NOT_VIEWABLE',
    headers: {
      'X-Page-Count': {
        description: 'how many pages the PDF has',
        schema: { type: 'integer' },
      },
    },
  })
  @ApiUnprocessableEntityResponse()
  @Header('X-Content-Type-Options', 'nosniff')
  async view(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query({ schema: viewSchema }) at: ViewAt,
    @Res({ passthrough: true }) res: Response,
  ) {
    const shown = await this.reader.view(userId, id, at);
    // set here, not by @Header, which would also stamp the failures
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (shown.pages !== null) res.setHeader('X-Page-Count', shown.pages);
    return new StreamableFile(shown.data, {
      type: shown.mime,
      disposition: 'inline',
    });
  }
}
