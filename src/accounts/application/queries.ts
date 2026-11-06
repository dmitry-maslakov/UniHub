import { Query } from '@nestjs/cqrs';
import type { Viewing } from './portal-accounts.js';

// The portals read with users' own accounts, and the user's own accounts in
// them that read now (PortalAccounts.viewing): what access cuts a user's
// reads of those portals to
export class ViewingAccountsQuery extends Query<Viewing> {
  constructor(public readonly userId: string) {
    super();
  }
}
