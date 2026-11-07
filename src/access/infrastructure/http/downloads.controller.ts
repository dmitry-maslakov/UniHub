import {
  Body,
  Controller,
  Get,
  Header,
  Logger,
  Param,
  Post,
  StreamableFile,
  UseFilters,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { create as contentDisposition } from 'content-disposition';
import { CurrentUserId } from '../../../identity/contracts.js';
import {
  Downloads,
  downloadRequestSchema,
  type DownloadItems,
} from '../../application/downloads.js';
import { Limited } from '../throttle.js';
import { DownloadTooLargeFilter } from './download-too-large.filter.js';
import { DownloadResponse } from './responses.js';
import { zipOf } from './zip-of.js';

@ApiTags('downloads')
@ApiBearerAuth()
@ApiNotFoundResponse()
@Controller('downloads')
export class DownloadsController {
  private readonly logger = new Logger(DownloadsController.name);

  constructor(private readonly downloads: Downloads) {}

  @Post()
  @Limited('downloads')
  @UseFilters(DownloadTooLargeFilter)
  @ApiCreatedResponse({
    type: DownloadResponse,
    description:
      'the zip is ready to fetch from `url` for ten minutes, as often as needed',
  })
  @ApiNotFoundResponse({
    description:
      'a file is one you may not download now (or a member was not kept); none is named',
  })
  @ApiUnprocessableEntityResponse({
    description: 'DOWNLOAD_TOO_LARGE: the files come to more than 1 GiB',
  })
  async create(
    @CurrentUserId() userId: string,
    @Body({ schema: downloadRequestSchema })
    { items }: { items: DownloadItems },
  ): Promise<DownloadResponse> {
    const { id, ...download } = await this.downloads.request(userId, items);
    return { url: `/api/downloads/${id}`, ...download };
  }

  @Get(':id')
  @Limited('api')
  @ApiProduces('application/zip')
  @ApiOkResponse({
    description:
      'the files of the request in one zip, streamed, stored without compression; each one is checked again as it is opened',
  })
  @Header('X-Content-Type-Options', 'nosniff')
  async zip(@CurrentUserId() userId: string, @Param('id') id: string) {
    const { name, entries } = await this.downloads.open(userId, id);
    return new StreamableFile(zipOf(entries), {
      type: 'application/zip',
      disposition: contentDisposition(name),
    }).setErrorHandler((error, res) => {
      // the browser shows the download failed; the log has the request, not
      // the user's file names (an error's message may carry them)
      this.logger.error(`download ${id} failed: ${error.name}`);
      res.destroy?.();
    });
  }
}
