import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ItemRepository } from '../../domain/item.js';
import { PortalCourseRepository } from '../../domain/portal-course.js';
import { UpsertItemCommand } from './upsert-item.command.js';
import { resolveId } from './resolve-id.js';

@CommandHandler(UpsertItemCommand)
export class UpsertItemHandler implements ICommandHandler<UpsertItemCommand> {
  constructor(
    private readonly items: ItemRepository,
    private readonly courses: PortalCourseRepository,
  ) {}

  async execute({ data: { course, ...data } }: UpsertItemCommand) {
    const portalCourseId = await resolveId(this.courses, data.portal, course);
    return this.items.upsert({ ...data, portalCourseId });
  }
}
