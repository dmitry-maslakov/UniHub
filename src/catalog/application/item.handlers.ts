import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import { Item } from '../domain/item/item.js';
import { ItemRepository } from '../domain/item/item.repository.js';
import { RemoveItemCommand, UpsertItemCommand } from './commands.js';
import { References } from './references.js';

@CommandHandler(UpsertItemCommand)
export class UpsertItemHandler implements ICommandHandler<UpsertItemCommand> {
  constructor(
    private readonly items: ItemRepository,
    private readonly references: References,
  ) {}

  @Transactional()
  async execute({
    data: { portal, externalId, course, ...props },
  }: UpsertItemCommand) {
    const portalCourseId =
      (await this.references.courseNamed(portal, course))?.id ?? null;
    const ref = { portal, externalId };
    const found = await this.items.getForUpdate(ref);
    const item = found ?? Item.create(ref, props, portalCourseId);
    const changed = found ? found.sync(props, portalCourseId) : true;
    await this.items.save(item);
    return { id: item.id, changed };
  }
}

@CommandHandler(RemoveItemCommand)
export class RemoveItemHandler implements ICommandHandler<RemoveItemCommand> {
  constructor(private readonly items: ItemRepository) {}

  @Transactional()
  async execute({ item: ref }: RemoveItemCommand) {
    const item = await this.items.getForUpdate(ref);
    if (!item) return { changed: false };
    const changed = item.remove();
    await this.items.save(item);
    return { changed };
  }
}
