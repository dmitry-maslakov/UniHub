import { Command } from '@nestjs/cqrs';
import type { ItemData } from '../../domain/item.js';

// `course` is the portal's id of the course, not ours
export type ItemInput = Omit<ItemData, 'portalCourseId'> & {
  course: string | null;
};

export class UpsertItemCommand extends Command<{
  id: string;
  changed: boolean;
}> {
  constructor(public readonly data: ItemInput) {
    super();
  }
}
