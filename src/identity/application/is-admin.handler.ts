import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { UnknownUserError } from '../domain/errors.js';
import { ReaderRepository } from '../domain/reader.js';
import { IsAdminQuery } from './queries.js';

@QueryHandler(IsAdminQuery)
export class IsAdminHandler implements IQueryHandler<IsAdminQuery> {
  constructor(private readonly readers: ReaderRepository) {}

  async execute({ userId }: IsAdminQuery) {
    const reader = await this.readers.findById(userId);
    if (!reader) throw new UnknownUserError(userId);
    return reader.adminAt();
  }
}
