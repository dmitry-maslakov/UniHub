import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { SyncStateRepository } from '../../domain/sync-state.js';
import { GetSyncStateQuery } from './get-sync-state.query.js';

@QueryHandler(GetSyncStateQuery)
export class GetSyncStateHandler implements IQueryHandler<GetSyncStateQuery> {
  constructor(private readonly states: SyncStateRepository) {}

  execute({ portal }: GetSyncStateQuery) {
    return this.states.get(portal);
  }
}
