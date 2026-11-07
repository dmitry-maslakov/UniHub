import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import {
  AccountCredentialQuery,
  AccountRejectedCommand,
  AdoptAccountsCommand,
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

// in the transaction of whoever asks, beside the records' own (plugins'
// InstanceAdoption)
@CommandHandler(AdoptAccountsCommand)
export class AdoptAccountsHandler implements ICommandHandler<AdoptAccountsCommand> {
  constructor(private readonly accounts: PortalAccounts) {}

  @Transactional()
  execute({ portal, instance }: AdoptAccountsCommand) {
    return this.accounts.adopt(portal, instance);
  }
}
