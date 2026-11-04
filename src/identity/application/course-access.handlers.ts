import { Injectable } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { CourseAccessRepository } from '../domain/course-access.js';
import { UnknownUserError } from '../domain/errors.js';
import { ReaderRepository } from '../domain/reader.js';
import {
  GrantCourseAccessCommand,
  RevokeCourseAccessCommand,
  type CourseAccessCommand,
} from './commands.js';

// A grant or a revoke, of a user who exists. Courses are catalog's, which
// identity doesn't know, so a course id isn't checked: one no course has
// reads nothing.
@Injectable()
abstract class CourseAccessHandler {
  constructor(
    private readonly readers: ReaderRepository,
    protected readonly access: CourseAccessRepository,
  ) {}

  protected abstract change(userId: string, courseId: string): Promise<boolean>;

  async execute({ userId, courseId }: CourseAccessCommand) {
    if (!(await this.readers.findById(userId)))
      throw new UnknownUserError(userId);
    return { changed: await this.change(userId, courseId) };
  }
}

@CommandHandler(GrantCourseAccessCommand)
export class GrantCourseAccessHandler
  extends CourseAccessHandler
  implements ICommandHandler<GrantCourseAccessCommand>
{
  protected change(userId: string, courseId: string) {
    return this.access.grant(userId, courseId);
  }
}

@CommandHandler(RevokeCourseAccessCommand)
export class RevokeCourseAccessHandler
  extends CourseAccessHandler
  implements ICommandHandler<RevokeCourseAccessCommand>
{
  protected change(userId: string, courseId: string) {
    return this.access.revoke(userId, courseId);
  }
}
