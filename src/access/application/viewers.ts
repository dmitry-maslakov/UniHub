import type { QueryBus } from '@nestjs/cqrs';
import {
  ViewingAccountsQuery,
  type Viewing,
} from '../../accounts/contracts.js';
import type { Viewers } from '../../catalog/contracts.js';
import { ReadScopeQuery, type ReadScope } from '../../identity/contracts.js';

// Whose views a user reads (README, Portal accounts): in the portals read
// as shared, the shared account's, of the courses granted them (an admin's
// every one); in the portals read with users' own accounts, their own
// accounts' that read now, an admin's as anyone's. A ban reads neither.
export const viewersOf = (scope: ReadScope, viewing: Viewing): Viewers => ({
  accounts: scope.ownAccounts ? viewing.accounts : [],
  shared: { courses: scope.granted, except: viewing.portals },
});

// the user's viewers now: identity's scope and accounts' accounts, asked
// for at once
export async function viewersOfUser(queries: QueryBus, userId: string) {
  const [scope, viewing] = await Promise.all([
    queries.execute(new ReadScopeQuery(userId)),
    queries.execute(new ViewingAccountsQuery(userId)),
  ]);
  return viewersOf(scope, viewing);
}
