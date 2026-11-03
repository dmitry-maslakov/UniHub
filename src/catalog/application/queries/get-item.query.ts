import { Query } from '@nestjs/cqrs';
import type { ItemDto } from './dtos.js';

export class GetItemQuery extends Query<ItemDto | null> {
  constructor(public readonly id: string) {
    super();
  }
}
