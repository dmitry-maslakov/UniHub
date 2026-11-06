import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseFilters,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { PortalId, type Secret } from '@app/kernel';
import { Limited } from '../../../access/contracts.js';
import { CurrentUserId, FreshSession } from '../../../identity/contracts.js';
import { PortalAccounts } from '../../application/portal-accounts.js';
import { tokenRequest } from './requests.js';
import { PortalResponse } from './responses.js';
import { TokenRefusedFilter } from './token-refused.filter.js';

const portalParam = { schema: PortalId };

// A signed-in user's own accounts of portals: a token is set, replaced or
// removed, never read back. Nothing here says anything of other users.
@ApiTags('portals')
@ApiBearerAuth()
@Controller('me/portals')
export class PortalAccountsController {
  constructor(private readonly accounts: PortalAccounts) {}

  @Get()
  @Limited('api')
  @ApiOkResponse({
    type: [PortalResponse],
    description: 'the portals you may link an account of, and yours',
  })
  list(@CurrentUserId() userId: string): Promise<PortalResponse[]> {
    return this.accounts.list(userId);
  }

  @Put(':portal/token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @FreshSession()
  @Limited('link')
  @UseFilters(TokenRefusedFilter)
  @ApiNoContentResponse({
    description:
      "linked; a token of the same portal user keeps the account, another's makes a new one",
  })
  @ApiForbiddenResponse({
    description: 'sign in again: this needs a session signed in within a day',
  })
  @ApiNotFoundResponse({
    description: 'the portal links no account of yours by token',
  })
  @ApiUnprocessableEntityResponse({
    description: "the portal didn't take the token",
  })
  @ApiServiceUnavailableResponse({
    description: 'the portal could not be asked; try again later',
  })
  @ApiTooManyRequestsResponse({ description: '10 a minute' })
  async setToken(
    @CurrentUserId() userId: string,
    @Param('portal', portalParam) portal: PortalId,
    @Body({ schema: tokenRequest }) token: Secret,
  ) {
    await this.accounts.setToken(userId, portal, token);
  }

  @Delete(':portal/token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Limited('api')
  @ApiNoContentResponse({
    description: 'no account of yours of the portal now, nor its token',
  })
  async unlink(
    @CurrentUserId() userId: string,
    @Param('portal', portalParam) portal: PortalId,
  ) {
    await this.accounts.unlink(userId, portal);
  }
}
