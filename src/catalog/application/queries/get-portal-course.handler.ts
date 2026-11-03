import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PortalCourseRepository } from '../../domain/portal-course.js';
import { toPortalCourseDto } from './dtos.js';
import { GetPortalCourseQuery } from './get-portal-course.query.js';

@QueryHandler(GetPortalCourseQuery)
export class GetPortalCourseHandler implements IQueryHandler<GetPortalCourseQuery> {
  constructor(private readonly courses: PortalCourseRepository) {}

  async execute({ id }: GetPortalCourseQuery) {
    const found = await this.courses.findById(id);
    return found && toPortalCourseDto(found);
  }
}
