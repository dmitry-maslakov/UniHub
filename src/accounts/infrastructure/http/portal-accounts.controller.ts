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
  ApiBadRequestResponse,
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
import { PortalId } from '@app/kernel';
import { Limited } from '../../../access/contracts.js';
import { CurrentUserId, FreshSession } from '../../../identity/contracts.js';
import { PortalAccounts } from '../../application/portal-accounts.js';
import type { SealedCredential } from '../../domain/credential-vault.js';
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
      "linked; a token of the same portal user of the same school's site keeps the account, any other makes a new one",
  })
  @ApiBadRequestResponse({
    description:
      "not a token, or the school's address missing on a portal that is a site per school (Canvas; code URL_NEEDED), not an https one, or given for any other portal (URL_NOT_TAKEN)",
  })
  @ApiForbiddenResponse({
    description: 'sign in again: this needs a session signed in within a day',
  })
  @ApiNotFoundResponse({
    description: 'the portal links no account of yours by token',
  })
  @ApiUnprocessableEntityResponse({
    description:
      "the portal didn't take the token (code TOKEN_REFUSED), or its site takes no pasted tokens, as a Canvas Instructure hosts (TOKENS_NOT_ALLOWED)",
  })
  @ApiServiceUnavailableResponse({
    description:
      'the portal could not be asked, or no such portal answers at the address, within 30 s (code PORTAL_UNREACHABLE); try again later',
  })
  @ApiTooManyRequestsResponse({ description: '10 a minute' })
  async setToken(
    @CurrentUserId() userId: string,
    @Param('portal', portalParam) portal: PortalId,
    @Body({ schema: tokenRequest }) credential: SealedCredential,
  ) {
    await this.accounts.setToken(userId, portal, credential);
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
