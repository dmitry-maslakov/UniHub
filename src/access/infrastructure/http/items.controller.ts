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
import { ItemResponse } from './responses.js';

@ApiTags('items')
@ApiBearerAuth()
@ApiNotFoundResponse()
@Controller('items')
@Limited('api')
export class ItemsController {
  constructor(private readonly reader: CourseReader) {}

  @Get(':id')
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
}
