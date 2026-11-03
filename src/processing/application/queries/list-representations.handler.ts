import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { RepresentationRepository } from '../../domain/representation.js';
import { ListRepresentationsQuery } from './list-representations.query.js';

@QueryHandler(ListRepresentationsQuery)
export class ListRepresentationsHandler implements IQueryHandler<ListRepresentationsQuery> {
  constructor(private readonly representations: RepresentationRepository) {}

  async execute({ hash }: ListRepresentationsQuery) {
    const found = await this.representations.latestOf(hash);
    return found.map(({ processor, version, parts }) => ({
      processor,
      version,
      parts,
    }));
  }
}
