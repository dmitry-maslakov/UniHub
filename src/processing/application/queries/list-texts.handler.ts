import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { RepresentationRepository } from '../../domain/representation.js';
import { ListTextsQuery } from './list-texts.query.js';

@QueryHandler(ListTextsQuery)
export class ListTextsHandler implements IQueryHandler<ListTextsQuery> {
  constructor(private readonly representations: RepresentationRepository) {}

  execute({ hash }: ListTextsQuery) {
    return this.representations.texts(hash);
  }
}
