import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StoredText } from '@app/kernel';
import { ADMIN_ROLE, Roles } from '../../../identity/contracts.js';
import { CourseGrants } from '../../application/course-grants.js';

// a user's id (Better Auth's) or a course's (catalog's): text postgres can
// keep, since a NUL would fail the lookup with a 500
const id = { schema: StoredText.min(1) };

// Who reads which course, set by admins. A course by the id catalog gave it
// (POST /api/courses answers it).
@ApiTags('admin')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'for admins only' })
@ApiNotFoundResponse({ description: 'no such user or course' })
@Roles([ADMIN_ROLE])
@Controller('users/:userId/courses/:courseId')
export class CourseAccessController {
  constructor(private readonly grants: CourseGrants) {}

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'the user reads the course' })
  grant(
    @Param('userId', id) userId: string,
    @Param('courseId', id) courseId: string,
  ) {
    return this.grants.grant(userId, courseId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: "the user doesn't read it now, unless an admin",
  })
  revoke(
    @Param('userId', id) userId: string,
    @Param('courseId', id) courseId: string,
  ) {
    return this.grants.revoke(userId, courseId);
  }
}
