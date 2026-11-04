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
import { ADMIN_ROLE, Roles } from '../../../identity/contracts.js';
import { CourseGrants } from '../../application/course-grants.js';
import { recordId } from './requests.js';

const id = { schema: recordId };

// Who reads which course, set by admins. A course by the id catalog gave it
// (POST /api/courses answers it).
@ApiTags('admin')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'for admins only' })
@Roles([ADMIN_ROLE])
@Controller('users/:userId/courses/:courseId')
export class CourseAccessController {
  constructor(private readonly grants: CourseGrants) {}

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'the user reads the course' })
  @ApiNotFoundResponse({ description: 'no such user or course' })
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
  @ApiNotFoundResponse({ description: 'no such user' })
  revoke(
    @Param('userId', id) userId: string,
    @Param('courseId', id) courseId: string,
  ) {
    return this.grants.revoke(userId, courseId);
  }
}
