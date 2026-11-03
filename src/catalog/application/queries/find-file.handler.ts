import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { FileRepository } from '../../domain/file.js';
import { toFileDto } from './file.dto.js';
import { FindFileQuery } from './find-file.query.js';

@QueryHandler(FindFileQuery)
export class FindFileHandler implements IQueryHandler<FindFileQuery> {
  constructor(private readonly files: FileRepository) {}

  async execute({ portal, externalId }: FindFileQuery) {
    const file = await this.files.findByExternalId(portal, externalId);
    return file && toFileDto(file);
  }
}
