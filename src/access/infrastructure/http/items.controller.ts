import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../../identity/contracts.js';
import { CourseReader } from '../../application/course-reader.js';
import { Limited } from '../throttle.js';
import { ItemResponse, PostTextResponse } from './responses.js';

@ApiTags('items')
@ApiBearerAuth()
@ApiNotFoundResponse()
@Controller('items')
export class ItemsController {
  constructor(private readonly reader: CourseReader) {}

  @Get(':id')
  @Limited('api')
  @ApiOkResponse({
    type: ItemResponse,
    description: 'a post of one of your courses, as search finds it',
  })
  item(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ItemResponse> {
    return this.reader.item(userId, id);
  }

  @Get(':id/text')
  @Limited('text')
  @ApiOkResponse({
    type: PostTextResponse,
    description:
      "the post's text as the hub reads it: every string the portal sent but links and dates, HTML read as plain text",
  })
  text(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PostTextResponse> {
    return this.reader.itemText(userId, id);
  }
}
