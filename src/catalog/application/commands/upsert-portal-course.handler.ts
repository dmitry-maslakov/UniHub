import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import { PortalCourseRepository } from '../../domain/portal-course.js';
import { UpsertPortalCourseCommand } from './upsert-portal-course.command.js';

@CommandHandler(UpsertPortalCourseCommand)
export class UpsertPortalCourseHandler implements ICommandHandler<UpsertPortalCourseCommand> {
  constructor(private readonly courses: PortalCourseRepository) {}

  @Transactional()
  async execute({ data }: UpsertPortalCourseCommand) {
    const { entity, changed } = await this.courses.upsert(data);
    return { id: entity.id, changed };
  }
}
