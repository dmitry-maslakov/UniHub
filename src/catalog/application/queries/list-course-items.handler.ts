import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { ItemRepository } from '../../domain/item.js';
import { toItemDto } from './dtos.js';
import { ListCourseItemsQuery } from './list-course-items.query.js';

@QueryHandler(ListCourseItemsQuery)
export class ListCourseItemsHandler implements IQueryHandler<ListCourseItemsQuery> {
  constructor(private readonly items: ItemRepository) {}

  async execute({ courseId, offset, limit }: ListCourseItemsQuery) {
    const items = await this.items.listOfCourse(courseId, offset, limit);
    return items.map(toItemDto);
  }
}
