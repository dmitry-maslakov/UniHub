import { Command } from '@nestjs/cqrs';
import type { Upserted } from '../../domain/changes.js';
import type { Item, ItemData } from '../../domain/item.js';

// `course` is the portal's id of the course, not ours
export type ItemInput = Omit<ItemData, 'portalCourseId'> & { course?: string };

export class UpsertItemCommand extends Command<Upserted<Item>> {
  constructor(public readonly data: ItemInput) {
    super();
  }
}
