import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { BlobStore } from '../../domain/blob-store.js';
import { GetContentQuery } from './get-content.query.js';

@QueryHandler(GetContentQuery)
export class GetContentHandler implements IQueryHandler<GetContentQuery> {
  constructor(private readonly blobs: BlobStore) {}

  execute({ hash }: GetContentQuery) {
    return this.blobs.get(hash);
  }
}
