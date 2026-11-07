import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PortalAccounts } from './portal-accounts.js';
import { UserPortalsQuery } from './queries.js';

@QueryHandler(UserPortalsQuery)
export class UserPortalsHandler implements IQueryHandler<UserPortalsQuery> {
  constructor(private readonly accounts: PortalAccounts) {}

  execute({ userId }: UserPortalsQuery) {
    return this.accounts.list(userId);
  }
}
