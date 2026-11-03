import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { ApiKeys } from '../../domain/api-keys.js';
import { isBanned, UserRepository } from '../../domain/user.js';
import { ApiKeyUserQuery } from './api-key-user.query.js';

@QueryHandler(ApiKeyUserQuery)
export class ApiKeyUserHandler implements IQueryHandler<ApiKeyUserQuery> {
  constructor(
    private readonly keys: ApiKeys,
    private readonly users: UserRepository,
  ) {}

  async execute({ key }: ApiKeyUserQuery) {
    const found = await this.keys.verify(key);
    if (!found) return null;
    // a ban ends sessions, but not keys
    const user = await this.users.findById(found.userId);
    return user && !isBanned(user) ? found : null;
  }
}
