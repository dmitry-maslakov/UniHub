import type { QueryBus } from '@nestjs/cqrs';
import {
  ViewingAccountsQuery,
  type Viewing,
} from '../../accounts/contracts.js';
import type { Viewers } from '../../catalog/contracts.js';
import { ReadScopeQuery, type ReadScope } from '../../identity/contracts.js';

// Whose views a user reads (README, Portal accounts): in the portals read
// as shared, the shared account's, of the courses granted them (an admin's
// every one); in the public ones, the shared account's of every course,
// an admin's as anyone's, and no grant's; in the portals read with users'
// own accounts, their own accounts' that read now, an admin's as anyone's.
// A ban reads none of it.
export const viewersOf = (
  scope: ReadScope,
  { portals, accounts, picks }: Viewing,
): Viewers => ({
  accounts: scope.ownAccounts ? accounts : [],
  shared: { courses: scope.granted, except: [...portals, ...picks.portals] },
  open: scope.ownAccounts ? picks.portals : [],
});

// Which of what a user reads they show among their courses (grouping.ts):
// the public portals' courses they picked, and the portal courses they
// hide
export interface Showing {
  picked: ReadonlySet<string>;
  hidden: ReadonlySet<string>;
}

// The user's viewers now, the picks they show with a course of their own
// and what they show (grouping.ts): identity's scope and accounts'
// accounts, picks and hidden courses, asked for at once
export async function readingOf(queries: QueryBus, userId: string) {
  const [scope, viewing] = await Promise.all([
    queries.execute(new ReadScopeQuery(userId)),
    queries.execute(new ViewingAccountsQuery(userId)),
  ]);
  const showing: Showing = {
    picked: new Set(viewing.picks.courses),
    hidden: new Set(viewing.hidden),
  };
  return {
    viewers: viewersOf(scope, viewing),
    into: viewing.picks.into,
    showing,
  };
}

// the viewers alone, for a read that names no course
export async function viewersOfUser(queries: QueryBus, userId: string) {
  return (await readingOf(queries, userId)).viewers;
}

// none granted, of a public portal or of their own: nothing to read,
// nothing to ask
export const readNothing = ({ accounts, shared, open }: Viewers) =>
  !accounts.length && !open.length && shared.courses?.length === 0;
