import { Query } from '@nestjs/cqrs';
import type { ItemDto } from './dtos.js';

// what the course's portals published, newest first, skipping removed ones
export class ListCourseItemsQuery extends Query<ItemDto[]> {
  constructor(
    public readonly courseId: string,
    public readonly offset: number,
    public readonly limit: number,
  ) {
    super();
  }
}
