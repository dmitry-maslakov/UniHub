import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import { CourseLink } from '../domain/course-link/course-link.js';
import { CourseLinkRepository } from '../domain/course-link/course-link.repository.js';
import { Course } from '../domain/course/course.js';
import { CourseRepository } from '../domain/course/course.repository.js';
import { CourseSlugTakenError, UnknownCourseError } from '../domain/errors.js';
import {
  CreateCourseCommand,
  LinkPortalCourseCommand,
  UnlinkPortalCourseCommand,
} from './commands.js';
import { References } from './references.js';

@CommandHandler(CreateCourseCommand)
export class CreateCourseHandler implements ICommandHandler<CreateCourseCommand> {
  constructor(private readonly courses: CourseRepository) {}

  async execute({ slug, name }: CreateCourseCommand) {
    const course = Course.create(slug, name);
    if (!(await this.courses.add(course))) throw new CourseSlugTakenError(slug);
    return { id: course.id };
  }
}

@CommandHandler(LinkPortalCourseCommand)
export class LinkPortalCourseHandler implements ICommandHandler<LinkPortalCourseCommand> {
  constructor(
    private readonly courses: CourseRepository,
    private readonly links: CourseLinkRepository,
    private readonly references: References,
  ) {}

  @Transactional()
  async execute({ course: slug, portalCourse, year }: LinkPortalCourseCommand) {
    const course = await this.courses.findBySlug(slug);
    if (!course) throw new UnknownCourseError(slug);
    const linked = await this.references.portalCourse(portalCourse);
    await this.links.save(CourseLink.of(linked, course, year));
  }
}

@CommandHandler(UnlinkPortalCourseCommand)
export class UnlinkPortalCourseHandler implements ICommandHandler<UnlinkPortalCourseCommand> {
  constructor(
    private readonly links: CourseLinkRepository,
    private readonly references: References,
  ) {}

  async execute({ portalCourse }: UnlinkPortalCourseCommand) {
    const linked = await this.references.portalCourse(portalCourse);
    return { changed: await this.links.remove(linked.id) };
  }
}
