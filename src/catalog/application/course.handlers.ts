import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import { CourseLink } from '../domain/course-link/course-link.js';
import { CourseLinkRepository } from '../domain/course-link/course-link.repository.js';
import { Course } from '../domain/course/course.js';
import { CourseRepository } from '../domain/course/course.repository.js';
import { CourseSlugTakenError, UnknownCourseError } from '../domain/errors.js';
import { PortalCourseRepository } from '../domain/portal-course/portal-course.repository.js';
import {
  CreateCourseCommand,
  LinkPortalCourseCommand,
  UnlinkPortalCourseCommand,
} from './commands.js';

@CommandHandler(CreateCourseCommand)
export class CreateCourseHandler implements ICommandHandler<CreateCourseCommand> {
  constructor(private readonly courses: CourseRepository) {}

  async execute({ slug, name }: CreateCourseCommand) {
    const course = Course.create(slug, name);
    if (!(await this.courses.add(course))) throw new CourseSlugTakenError(slug);
    return { id: course.id };
  }
}

// An admin's link names a portal course whether the hub has it or not, and
// answers the same either way: what a portal read with users' own accounts
// has is theirs to know, not an admin's. A course nothing sent yet links
// nothing anyone reads until an account sends it.
@CommandHandler(LinkPortalCourseCommand)
export class LinkPortalCourseHandler implements ICommandHandler<LinkPortalCourseCommand> {
  constructor(
    private readonly courses: CourseRepository,
    private readonly links: CourseLinkRepository,
    private readonly portalCourses: PortalCourseRepository,
  ) {}

  @Transactional()
  async execute({ course: slug, portalCourse, year }: LinkPortalCourseCommand) {
    const course = await this.courses.findBySlug(slug);
    if (!course) throw new UnknownCourseError(slug);
    const id = await this.portalCourses.keep(portalCourse);
    await this.links.save(CourseLink.of({ id }, course, year));
  }
}

@CommandHandler(UnlinkPortalCourseCommand)
export class UnlinkPortalCourseHandler implements ICommandHandler<UnlinkPortalCourseCommand> {
  constructor(
    private readonly links: CourseLinkRepository,
    private readonly portalCourses: PortalCourseRepository,
  ) {}

  async execute({ portalCourse }: UnlinkPortalCourseCommand) {
    const id = await this.portalCourses.recordId(portalCourse);
    return { changed: id !== null && (await this.links.remove(id)) };
  }
}
