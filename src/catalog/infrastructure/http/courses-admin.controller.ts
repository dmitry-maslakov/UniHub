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
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { PortalId, StoredText } from '@app/kernel';
import { ADMIN_ROLE, Roles } from '../../../identity/contracts.js';
import {
  CreateCourseCommand,
  LinkPortalCourseCommand,
  UnlinkPortalCourseCommand,
} from '../../application/commands.js';
import { AcademicYear, CourseName, Slug } from '../../domain/values.js';

// a portal course's id as its portal has it; text postgres can't keep would
// fail the lookup with a 500
const ExternalId = StoredText.min(1);
const newCourse = z.object({ slug: Slug, name: CourseName });
const link = z.object({
  course: Slug,
  // none for a portal course that spans years
  year: AcademicYear.nullable().default(null),
});

// What admins set up: courses, and which portal courses each is made of.
// A portal course is named the way its portal names it. Each value is checked
// against its own rules (ValidationModule): a bad one is a 400, never a command.
@ApiTags('admin')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'for admins only' })
@Roles([ADMIN_ROLE])
@Controller()
export class CoursesAdminController {
  constructor(private readonly commands: CommandBus) {}

  @Post('courses')
  @ApiCreatedResponse({ description: "the new course's id" })
  @ApiConflictResponse({ description: 'another course has the slug' })
  create(@Body({ schema: newCourse }) body: z.output<typeof newCourse>) {
    return this.commands.execute(new CreateCourseCommand(body.slug, body.name));
  }

  @Put('portal-courses/:portal/:externalId/course')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'linked; a portal course linked elsewhere moves here',
  })
  @ApiNotFoundResponse({ description: 'no such course or portal course' })
  async link(
    @Param('portal', { schema: PortalId }) portal: PortalId,
    @Param('externalId', { schema: ExternalId }) externalId: string,
    @Body({ schema: link }) { course, year }: z.output<typeof link>,
  ) {
    await this.commands.execute(
      new LinkPortalCourseCommand(course, { portal, externalId }, year),
    );
  }

  @Delete('portal-courses/:portal/:externalId/course')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'not linked to any course now' })
  @ApiNotFoundResponse({ description: 'no such portal course' })
  async unlink(
    @Param('portal', { schema: PortalId }) portal: PortalId,
    @Param('externalId', { schema: ExternalId }) externalId: string,
  ) {
    await this.commands.execute(
      new UnlinkPortalCourseCommand({ portal, externalId }),
    );
  }
}
