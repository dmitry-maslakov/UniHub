import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { ItemRepository } from '../../domain/item.js';
import { toItemDto } from './dtos.js';
import { GetItemQuery } from './get-item.query.js';

@QueryHandler(GetItemQuery)
export class GetItemHandler implements IQueryHandler<GetItemQuery> {
  constructor(private readonly items: ItemRepository) {}

  async execute({ id }: GetItemQuery) {
    const found = await this.items.findById(id);
    return found && toItemDto(found);
  }
}
