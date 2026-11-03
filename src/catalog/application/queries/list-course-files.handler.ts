import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { FileRepository } from '../../domain/file.js';
import { toFileDto } from './dtos.js';
import { ListCourseFilesQuery } from './list-course-files.query.js';

@QueryHandler(ListCourseFilesQuery)
export class ListCourseFilesHandler implements IQueryHandler<ListCourseFilesQuery> {
  constructor(private readonly files: FileRepository) {}

  async execute({ courseId, offset, limit }: ListCourseFilesQuery) {
    const files = await this.files.listOfCourse(courseId, offset, limit);
    return files.map(toFileDto);
  }
}
