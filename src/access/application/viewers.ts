import type { QueryBus } from '@nestjs/cqrs';
import {
  ViewingAccountsQuery,
  type Viewing,
} from '../../accounts/contracts.js';
import type { Viewers } from '../../catalog/contracts.js';
import { ReadScopeQuery, type ReadScope } from '../../identity/contracts.js';

// Whose views a user reads (README, Portal accounts): in the portals read
// as shared, the shared account's, of the courses granted them (an admin's
// every one); in the public ones, the shared account's of the courses they
// picked, an admin's as anyone's, and no grant's; in the portals read with
// users' own accounts, their own accounts' that read now, an admin's as
// anyone's. A ban reads none of it.
export const viewersOf = (
  scope: ReadScope,
  { portals, accounts, picks }: Viewing,
): Viewers => ({
  accounts: scope.ownAccounts ? accounts : [],
  shared: { courses: scope.granted, except: [...portals, ...picks.portals] },
  picks: {
    portals: picks.portals,
    courses: scope.ownAccounts ? picks.courses : [],
  },
});

// The user's viewers now, and the picks they show with a course of their
// own (grouping.ts): identity's scope and accounts' accounts and picks,
// asked for at once
export async function readingOf(queries: QueryBus, userId: string) {
  const [scope, viewing] = await Promise.all([
    queries.execute(new ReadScopeQuery(userId)),
    queries.execute(new ViewingAccountsQuery(userId)),
  ]);
  return { viewers: viewersOf(scope, viewing), into: viewing.picks.into };
}

// the viewers alone, for a read that names no course
export async function viewersOfUser(queries: QueryBus, userId: string) {
  return (await readingOf(queries, userId)).viewers;
}

// none granted, picked or of their own: nothing to read, nothing to ask
export const readNothing = ({ accounts, shared, picks }: Viewers) =>
  !accounts.length && !picks.courses.length && shared.courses?.length === 0;
