import { Query } from '@nestjs/cqrs';
import type { FileDto } from './dtos.js';

// the course's files by folder and name, skipping removed ones
export class ListCourseFilesQuery extends Query<FileDto[]> {
  constructor(
    public readonly courseId: string,
    public readonly offset: number,
    public readonly limit: number,
  ) {
    super();
  }
}
