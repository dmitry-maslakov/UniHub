import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { z } from 'zod';
import { ADMIN_ROLE, Roles } from '../../../identity/contracts.js';
import { HubCourses } from '../../application/hub-courses.js';
import { recordId, linkableSchema } from './requests.js';
import {
  CourseReaderResponse,
  HubCourseResponse,
  LinkableResponse,
} from './responses.js';

// What admins read to set the courses up: the courses they made with what
// they link and who reads them, and the portal courses they may link
@ApiTags('admin')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'for admins only' })
@Roles([ADMIN_ROLE])
@Controller('admin')
export class HubCoursesController {
  constructor(private readonly courses: HubCourses) {}

  @Get('courses')
  @ApiOkResponse({
    type: [HubCourseResponse],
    description: 'every course an admin made, by name, with its links',
  })
  list(): Promise<HubCourseResponse[]> {
    return this.courses.list();
  }

  @Get('courses/:courseId/readers')
  @ApiOkResponse({
    type: [CourseReaderResponse],
    description: 'the users granted the course, by name',
  })
  @ApiNotFoundResponse({ description: 'no such course' })
  readers(
    @Param('courseId', { schema: recordId }) courseId: string,
  ): Promise<CourseReaderResponse[]> {
    return this.courses.readers(courseId);
  }

  @Get('portal-courses')
  @ApiOkResponse({
    type: LinkableResponse,
    description:
      "a page of the courses of the shared and public portals whose names have the words, by name: those a course can link (never a portal read with users' own accounts)",
  })
  linkable(
    @Query({ schema: linkableSchema }) page: z.output<typeof linkableSchema>,
  ): Promise<LinkableResponse> {
    return this.courses.linkable(page);
  }
}
