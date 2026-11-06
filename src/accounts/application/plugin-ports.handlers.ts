import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import {
  AccountCredentialQuery,
  AccountRejectedCommand,
  PortalReadersQuery,
} from '../../plugins/contracts.js';
import { PortalAccounts } from './portal-accounts.js';

// What plugins ask of users' own accounts as they run them
// (plugins/application/accounts.ts), answered here.

@QueryHandler(PortalReadersQuery)
export class PortalReadersHandler implements IQueryHandler<PortalReadersQuery> {
  constructor(private readonly accounts: PortalAccounts) {}

  execute({ portal }: PortalReadersQuery) {
    return this.accounts.readers(portal);
  }
}

@QueryHandler(AccountCredentialQuery)
export class AccountCredentialHandler implements IQueryHandler<AccountCredentialQuery> {
  constructor(private readonly accounts: PortalAccounts) {}

  execute({ account }: AccountCredentialQuery) {
    return this.accounts.credential(account);
  }
}

@CommandHandler(AccountRejectedCommand)
export class AccountRejectedHandler implements ICommandHandler<AccountRejectedCommand> {
  constructor(private readonly accounts: PortalAccounts) {}

  execute({ account, seal }: AccountRejectedCommand) {
    return this.accounts.rejected(account, seal);
  }
}
