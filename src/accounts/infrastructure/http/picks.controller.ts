import {
  Body,
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
  ApiBody,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { PortalId } from '@app/kernel';
import { Limited } from '../../../access/contracts.js';
import type { CourseSlug } from '../../../catalog/contracts.js';
import { CurrentUserId } from '../../../identity/contracts.js';
import { PortalPicks } from '../../application/portal-picks.js';
import { PickRefusedFilter } from './pick-refused.filter.js';
import { externalId, pickRequest } from './requests.js';

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
  @UseFilters(PickRefusedFilter)
  // no body at all is a pick alone, as {} is (pickRequest)
  @ApiBody({ required: false })
  @ApiNoContentResponse({
    description:
      'picked, with no body or {}: you read it from now on, shown with the course `into` names if it does',
  })
  @ApiNotFoundResponse({
    description: 'the portal is no public one, or has no such course',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'TOO_MANY_PICKS: you picked 100 already; NOT_YOUR_COURSE: `into` is no course you read through your own account',
  })
  async pick(
    @CurrentUserId() userId: string,
    @Param('portal', portalParam) portal: PortalId,
    @Param('externalId', courseParam) course: string,
    @Body({ schema: pickRequest }) into: CourseSlug | null | undefined,
  ) {
    await this.picks.pick(userId, portal, course, into);
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
