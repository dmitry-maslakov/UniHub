import { Command } from '@nestjs/cqrs';
import type { Upserted } from '../../domain/changes.js';
import type { Item, ItemData } from '../../domain/item.js';

export class UpsertItemCommand extends Command<Upserted<Item>> {
  constructor(public readonly data: ItemData) {
    super();
  }
}
