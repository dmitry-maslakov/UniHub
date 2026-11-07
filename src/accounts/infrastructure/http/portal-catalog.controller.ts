import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { z } from 'zod';
import { PortalId } from '@app/kernel';
import { Limited } from '../../../access/contracts.js';
import { CurrentUserId } from '../../../identity/contracts.js';
import { PortalPicks } from '../../application/portal-picks.js';
import { catalogRequest } from './requests.js';
import { CatalogResponse } from './responses.js';

// A public portal's catalog, as a signed-in user browses it to pick
// courses, with their picks marked
@ApiTags('portals')
@ApiBearerAuth()
@Controller('portals')
export class PortalCatalogController {
  constructor(private readonly picks: PortalPicks) {}

  @Get(':portal/catalog')
  @Limited('api')
  @ApiOkResponse({
    type: CatalogResponse,
    description: 'a page of its courses whose names have the words, by name',
  })
  @ApiNotFoundResponse({ description: 'the portal is no public one' })
  catalog(
    @CurrentUserId() userId: string,
    @Param('portal', { schema: PortalId }) portal: PortalId,
    @Query({ schema: catalogRequest }) page: z.output<typeof catalogRequest>,
  ): Promise<CatalogResponse> {
    return this.picks.catalog(userId, portal, page);
  }
}
