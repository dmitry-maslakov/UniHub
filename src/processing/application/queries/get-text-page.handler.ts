import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { RepresentationRepository } from '../../domain/representation.js';
import { GetTextPageQuery } from './get-text-page.query.js';

@QueryHandler(GetTextPageQuery)
export class GetTextPageHandler implements IQueryHandler<GetTextPageQuery> {
  constructor(private readonly representations: RepresentationRepository) {}

  async execute({ hash, page, processor }: GetTextPageQuery) {
    if (!Number.isInteger(page) || page < 1) return null;
    return this.representations.page(hash, page, processor);
  }
}
