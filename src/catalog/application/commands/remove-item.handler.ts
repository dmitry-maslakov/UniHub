import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import { CatalogEvents } from '../../domain/events.js';
import { ItemRepository } from '../../domain/item.js';
import { RemoveItemCommand } from './remove-item.command.js';

@CommandHandler(RemoveItemCommand)
export class RemoveItemHandler implements ICommandHandler<RemoveItemCommand> {
  constructor(
    private readonly items: ItemRepository,
    private readonly events: CatalogEvents,
  ) {}

  @Transactional()
  async execute({ portal, externalId }: RemoveItemCommand) {
    const removed = await this.items.markRemoved(portal, externalId);
    if (removed?.changed)
      await this.events.itemRemoved({ portal, itemId: removed.id });
    return { changed: removed?.changed ?? false };
  }
}
