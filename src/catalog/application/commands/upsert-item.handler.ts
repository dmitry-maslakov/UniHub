import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import { CatalogEvents } from '../../domain/events.js';
import { ItemRepository } from '../../domain/item.js';
import { PortalCourseRepository } from '../../domain/portal-course.js';
import { resolveId } from './resolve-id.js';
import { UpsertItemCommand } from './upsert-item.command.js';

@CommandHandler(UpsertItemCommand)
export class UpsertItemHandler implements ICommandHandler<UpsertItemCommand> {
  constructor(
    private readonly items: ItemRepository,
    private readonly courses: PortalCourseRepository,
    private readonly events: CatalogEvents,
  ) {}

  @Transactional()
  async execute({ data: { course, ...data } }: UpsertItemCommand) {
    const portalCourseId = await resolveId(this.courses, data.portal, course);
    const { entity, changed } = await this.items.upsert({
      ...data,
      portalCourseId,
    });
    if (changed)
      await this.events.itemChanged({ portal: data.portal, itemId: entity.id });
    return { id: entity.id, changed };
  }
}
