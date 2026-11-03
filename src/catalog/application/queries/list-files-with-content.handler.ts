import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { FileRepository } from '../../domain/file.js';
import { toFileDto } from './dtos.js';
import { ListFilesWithContentQuery } from './list-files-with-content.query.js';

@QueryHandler(ListFilesWithContentQuery)
export class ListFilesWithContentHandler implements IQueryHandler<ListFilesWithContentQuery> {
  constructor(private readonly files: FileRepository) {}

  async execute({ after, limit }: ListFilesWithContentQuery) {
    return (await this.files.listWithContent(after, limit)).map(toFileDto);
  }
}
