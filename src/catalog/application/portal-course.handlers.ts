import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import { PortalCourse } from '../domain/portal-course/portal-course.js';
import { PortalCourseRepository } from '../domain/portal-course/portal-course.repository.js';
import { UpsertPortalCourseCommand } from './commands.js';

@CommandHandler(UpsertPortalCourseCommand)
export class UpsertPortalCourseHandler implements ICommandHandler<UpsertPortalCourseCommand> {
  constructor(private readonly courses: PortalCourseRepository) {}

  @Transactional()
  async execute({
    data: { portal, externalId, ...props },
  }: UpsertPortalCourseCommand) {
    const ref = { portal, externalId };
    const found = await this.courses.getForUpdate(ref);
    const course =
      found ??
      PortalCourse.create(
        ref,
        props,
        (await this.courses.recordId(ref)) ?? undefined,
      );
    const changed = found ? found.sync(props) : true;
    await this.courses.save(course);
    return { id: course.id, changed };
  }
}
