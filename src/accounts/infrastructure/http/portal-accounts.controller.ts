import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
  Redirect,
  UseFilters,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiFoundResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiSeeOtherResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { PortalId, type Secret } from '@app/kernel';
import { Limited } from '../../../access/contracts.js';
import { CurrentUserId, FreshSession } from '../../../identity/contracts.js';
import { OAuthLinking } from '../../application/oauth-linking.js';
import { PortalAccounts } from '../../application/portal-accounts.js';
import { consentAnswer, tokenRequest } from './requests.js';
import { PortalResponse } from './responses.js';
import { TokenRefusedFilter } from './token-refused.filter.js';

const portalParam = { schema: PortalId };

// A signed-in user's own accounts of portals: a token is set, replaced or
// removed, or a portal's consent asked for, never read back. Nothing here
// says anything of other users.
@ApiTags('portals')
@ApiBearerAuth()
@Controller('me/portals')
export class PortalAccountsController {
  constructor(
    private readonly accounts: PortalAccounts,
    private readonly oauth: OAuthLinking,
  ) {}

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

  // Opened in the browser the user is signed in with: the portal's
  // consent page, which sends them back to the callback
  @Get(':portal/oauth')
  @Redirect()
  @FreshSession()
  @Limited('link')
  @ApiFoundResponse({ description: "to the portal's consent page" })
  @ApiForbiddenResponse({
    description: 'sign in again: this needs a session signed in within a day',
  })
  @ApiNotFoundResponse({
    description: 'the portal links no account of yours by OAuth',
  })
  @ApiTooManyRequestsResponse({ description: '10 a minute' })
  async startOAuth(
    @CurrentUserId() userId: string,
    @Param('portal', portalParam) portal: PortalId,
  ) {
    return { url: (await this.oauth.start(userId, portal)).href };
  }

  @Get(':portal/oauth/callback')
  @Redirect('/api/me/portals', HttpStatus.SEE_OTHER)
  @FreshSession()
  @Limited('link')
  @UseFilters(TokenRefusedFilter)
  @ApiSeeOtherResponse({
    description:
      "linked: to your portals. The same portal user's account as before stays, another's makes a new one",
  })
  @ApiBadRequestResponse({
    description:
      'no consent of yours on its way by this state: it ran out, was used, or is not yours',
  })
  @ApiUnprocessableEntityResponse({
    description: 'the portal did not link the account (you said no there)',
  })
  @ApiServiceUnavailableResponse({
    description: 'the portal could not be asked; try again later',
  })
  async finishOAuth(
    @CurrentUserId() userId: string,
    @Param('portal', portalParam) portal: PortalId,
    @Query({ schema: consentAnswer }) answer: URLSearchParams,
  ) {
    await this.oauth.finish(userId, portal, answer);
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

  // the same, for an account linked by the portal's consent page
  @Delete(':portal/oauth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Limited('api')
  @ApiNoContentResponse({
    description:
      'no account of yours of the portal now: its consent taken back there, and its tokens gone',
  })
  async unlinkOAuth(
    @CurrentUserId() userId: string,
    @Param('portal', portalParam) portal: PortalId,
  ) {
    await this.accounts.unlink(userId, portal);
  }
}
