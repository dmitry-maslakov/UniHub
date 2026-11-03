import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ItemRepository } from '../../domain/item.js';
import { UpsertItemCommand } from './upsert-item.command.js';

@CommandHandler(UpsertItemCommand)
export class UpsertItemHandler implements ICommandHandler<UpsertItemCommand> {
  constructor(private readonly repository: ItemRepository) {}

  execute({ data }: UpsertItemCommand) {
    return this.repository.upsert(data);
  }
}
