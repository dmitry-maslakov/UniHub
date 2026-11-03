import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { FileRepository } from '../../domain/file.js';
import { GetFileQuery } from './get-file.query.js';

@QueryHandler(GetFileQuery)
export class GetFileHandler implements IQueryHandler<GetFileQuery> {
  constructor(private readonly files: FileRepository) {}

  execute({ id }: GetFileQuery) {
    return this.files.findById(id);
  }
}
