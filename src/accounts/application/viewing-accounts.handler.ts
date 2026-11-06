import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PortalAccounts } from './portal-accounts.js';
import { ViewingAccountsQuery } from './queries.js';

@QueryHandler(ViewingAccountsQuery)
export class ViewingAccountsHandler implements IQueryHandler<ViewingAccountsQuery> {
  constructor(private readonly accounts: PortalAccounts) {}

  execute({ userId }: ViewingAccountsQuery) {
    return this.accounts.viewing(userId);
  }
}
