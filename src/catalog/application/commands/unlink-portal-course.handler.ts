import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { CourseRepository } from '../../domain/course.js';
import { PortalCourseRepository } from '../../domain/portal-course.js';
import { resolveId } from './resolve-id.js';
import { UnlinkPortalCourseCommand } from './unlink-portal-course.command.js';

@CommandHandler(UnlinkPortalCourseCommand)
export class UnlinkPortalCourseHandler implements ICommandHandler<UnlinkPortalCourseCommand> {
  constructor(
    private readonly courses: CourseRepository,
    private readonly portalCourses: PortalCourseRepository,
  ) {}

  async execute({ portal, externalId }: UnlinkPortalCourseCommand) {
    const portalCourseId = (await resolveId(
      this.portalCourses,
      portal,
      externalId,
    ))!;
    return { changed: await this.courses.unlink(portalCourseId) };
  }
}
