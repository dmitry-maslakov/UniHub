import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@thallesp/nestjs-better-auth';
import { StoredText } from '@app/kernel';
import {
  GrantCourseAccessCommand,
  RevokeCourseAccessCommand,
} from '../../application/commands.js';
import { ADMIN_ROLE } from '../../domain/reader.js';

// a user's id (Better Auth's) or a course's (catalog's): text postgres can
// keep, since a NUL would fail the lookup with a 500
const id = { schema: StoredText.min(1), pipes: [StandardSchemaValidationPipe] };

// Who reads which course, set by admins. A course by the id catalog gave it
// (POST /api/courses answers it): identity knows no slugs.
@ApiTags('admin')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'for admins only' })
@ApiNotFoundResponse({ description: 'no such user' })
@Roles([ADMIN_ROLE])
@Controller('users/:userId/courses/:courseId')
export class CourseAccessController {
  constructor(private readonly commands: CommandBus) {}

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'the user reads the course' })
  async grant(
    @Param('userId', id) userId: string,
    @Param('courseId', id) courseId: string,
  ) {
    await this.commands.execute(new GrantCourseAccessCommand(userId, courseId));
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: "the user doesn't read it now, unless an admin",
  })
  async revoke(
    @Param('userId', id) userId: string,
    @Param('courseId', id) courseId: string,
  ) {
    await this.commands.execute(
      new RevokeCourseAccessCommand(userId, courseId),
    );
  }
}
