import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { InvalidValueError } from '@app/kernel';
import { Transactional } from '@nestjs-cls/transactional';
import { CourseRepository } from '../../domain/course.js';
import { UnknownCourseError } from '../../domain/errors.js';
import { PortalCourseRepository } from '../../domain/portal-course.js';
import { LinkPortalCourseCommand } from './link-portal-course.command.js';
import { resolveId } from './resolve-id.js';

@CommandHandler(LinkPortalCourseCommand)
export class LinkPortalCourseHandler implements ICommandHandler<LinkPortalCourseCommand> {
  constructor(
    private readonly courses: CourseRepository,
    private readonly portalCourses: PortalCourseRepository,
  ) {}

  @Transactional()
  async execute({
    courseSlug,
    portal,
    externalId,
    year,
  }: LinkPortalCourseCommand) {
    if (
      year !== null &&
      !(Number.isInteger(year) && year > 1900 && year < 3000)
    )
      throw new InvalidValueError('academic year', String(year));
    const course = await this.courses.findBySlug(courseSlug);
    if (!course) throw new UnknownCourseError(courseSlug);
    const portalCourseId = (await resolveId(
      this.portalCourses,
      portal,
      externalId,
    ))!;
    await this.courses.link({ courseId: course.id, portalCourseId, year });
  }
}
