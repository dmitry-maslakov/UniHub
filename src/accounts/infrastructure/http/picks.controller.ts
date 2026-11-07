import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseFilters,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { PortalId } from '@app/kernel';
import { Limited } from '../../../access/contracts.js';
import { CurrentUserId } from '../../../identity/contracts.js';
import { PortalPicks } from '../../application/portal-picks.js';
import { externalId } from './requests.js';
import { TooManyPicksFilter } from './too-many-picks.filter.js';

const portalParam = { schema: PortalId };
const courseParam = { schema: externalId };

// A signed-in user's picks of public portals' courses: what they read of
// those portals. Nothing here says anything of other users.
@ApiTags('portals')
@ApiBearerAuth()
@Controller('me/picks')
@Limited('picks')
@ApiTooManyRequestsResponse({ description: '30 a minute' })
export class PicksController {
  constructor(private readonly picks: PortalPicks) {}

  @Put(':portal/:externalId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseFilters(TooManyPicksFilter)
  @ApiNoContentResponse({
    description: 'picked, with no body or {}: you read it from now on',
  })
  @ApiNotFoundResponse({
    description: 'the portal is no public one, or has no such course',
  })
  @ApiUnprocessableEntityResponse({
    description: 'TOO_MANY_PICKS: you picked 100 already',
  })
  async pick(
    @CurrentUserId() userId: string,
    @Param('portal', portalParam) portal: PortalId,
    @Param('externalId', courseParam) course: string,
  ) {
    await this.picks.pick(userId, portal, course);
  }

  @Delete(':portal/:externalId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: "not picked by you now, whether it was or wasn't",
  })
  async unpick(
    @CurrentUserId() userId: string,
    @Param('portal', portalParam) portal: PortalId,
    @Param('externalId', courseParam) course: string,
  ) {
    await this.picks.unpick(userId, portal, course);
  }
}
