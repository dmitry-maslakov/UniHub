import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PortalCourseRepository } from '../../domain/portal-course.js';
import { UpsertPortalCourseCommand } from './upsert-portal-course.command.js';

@CommandHandler(UpsertPortalCourseCommand)
export class UpsertPortalCourseHandler implements ICommandHandler<UpsertPortalCourseCommand> {
  constructor(private readonly repository: PortalCourseRepository) {}

  execute({ data }: UpsertPortalCourseCommand) {
    return this.repository.upsert(data);
  }
}
