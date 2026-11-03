import { Query } from '@nestjs/cqrs';
import type { FileDto } from './dtos.js';

// a page of files that have content, for walking all of them
export class ListFilesWithContentQuery extends Query<FileDto[]> {
  constructor(
    public readonly after: string | null,
    public readonly limit: number,
  ) {
    super();
  }
}
