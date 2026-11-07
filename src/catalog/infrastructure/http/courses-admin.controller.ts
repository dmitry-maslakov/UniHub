import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { z } from 'zod';
import { PortalId } from '@app/kernel';
import { ADMIN_ROLE, Roles } from '../../../identity/contracts.js';
import {
  CreateCourseCommand,
  LinkPortalCourseCommand,
  UnlinkPortalCourseCommand,
} from '../../application/commands.js';
import { ConfiguredInstanceQuery } from '../../application/queries.js';
import type { PortalRef } from '../../domain/portal-ref.js';
import { courseLink, ExternalId, newCourse } from './requests.js';

// What admins set up: courses, and which portal courses each is made of.
// A portal course is named the way its portal names it, of the site the
// portal's own settings read (CANVAS_URL), and answered the same whether
// the hub has it or not.
@ApiTags('admin')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'for admins only' })
@Roles([ADMIN_ROLE])
@Controller()
export class CoursesAdminController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Post('courses')
  @ApiCreatedResponse({ description: "the new course's id" })
  @ApiConflictResponse({ description: 'another course has the slug' })
  create(@Body({ schema: newCourse }) body: z.output<typeof newCourse>) {
    return this.commands.execute(new CreateCourseCommand(body.slug, body.name));
  }

  @Put('portal-courses/:portal/:externalId/course')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description:
      'linked, whether the hub has the portal course yet or not; one linked elsewhere moves here',
  })
  @ApiNotFoundResponse({ description: 'no such course' })
  async link(
    @Param('portal', { schema: PortalId }) portal: PortalId,
    @Param('externalId', { schema: ExternalId }) externalId: string,
    @Body({ schema: courseLink }) { course, year }: z.output<typeof courseLink>,
  ) {
    await this.commands.execute(
      new LinkPortalCourseCommand(
        course,
        await this.ref(portal, externalId),
        year,
      ),
    );
  }

  @Delete('portal-courses/:portal/:externalId/course')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'not linked to any course now' })
  async unlink(
    @Param('portal', { schema: PortalId }) portal: PortalId,
    @Param('externalId', { schema: ExternalId }) externalId: string,
  ) {
    await this.commands.execute(
      new UnlinkPortalCourseCommand(await this.ref(portal, externalId)),
    );
  }

  private async ref(portal: PortalId, externalId: string): Promise<PortalRef> {
    const instance = await this.queries.execute(
      new ConfiguredInstanceQuery(portal),
    );
    return { portal, instance, externalId };
  }
}
