import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { FileRepository } from '../../domain/file.js';
import { toFileDto } from './file.dto.js';
import { GetFileQuery } from './get-file.query.js';

@QueryHandler(GetFileQuery)
export class GetFileHandler implements IQueryHandler<GetFileQuery> {
  constructor(private readonly files: FileRepository) {}

  async execute({ id }: GetFileQuery) {
    const file = await this.files.findById(id);
    return file && toFileDto(file);
  }
}
