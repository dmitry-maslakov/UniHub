import { TooManyPicksError } from './errors.js';

// A user picks at most this many courses of public portals' catalogs: each
// one is a course its connector is asked to sync
export const MAX_PICKS = 100;

// Of a user's picks, those in each public portal's catalog now: what the
// user sees picked, and what counts toward MAX_PICKS. One left of a portal
// no longer public, or of a course gone from its catalog, is neither:
// nowhere to unpick it.
export function pickedIn<Portal>(
  catalogs: ReadonlyMap<Portal, readonly { id: string }[]>,
  picked: readonly string[],
): Map<Portal, string[]> {
  const mine = new Set(picked);
  return new Map(
    [...catalogs].map(([portal, courses]) => [
      portal,
      courses.filter(({ id }) => mine.has(id)).map(({ id }) => id),
    ]),
  );
}

// TooManyPicksError unless a user who picked these may pick the course: one
// picked already is no new one
export function checkRoom(picked: readonly string[], portalCourseId: string) {
  if (picked.length >= MAX_PICKS && !picked.includes(portalCourseId))
    throw new TooManyPicksError(MAX_PICKS);
}

// Users' picks of public portals' courses (README, Public portals), by the
// portal courses' ids: what each user reads of those portals, with no grant
export abstract class PickRepository {
  // the portal courses the user picked
  abstract ofUser(userId: string): Promise<string[]>;
  // of them, those the user shows with a course of their own, each by the
  // portal course of their own account it goes with
  abstract intoOf(userId: string): Promise<Map<string, string>>;
  // the same, and no other pick of the user's is made till the transaction
  // ends: two at once can't both find room for one more
  abstract lockOf(userId: string): Promise<string[]>;
  abstract add(userId: string, portalCourseId: string): Promise<void>;
  // the user's pick shown with that portal course of theirs, or on its own
  // (null)
  abstract showWith(
    userId: string,
    portalCourseId: string,
    into: string | null,
  ): Promise<void>;
  // the user's pick gone, and how many users pick it still; null if the
  // user didn't
  abstract remove(
    userId: string,
    portalCourseId: string,
  ): Promise<number | null>;
  // the user's picks gone, all of them, and the courses no one picks now
  abstract removeAllOf(userId: string): Promise<string[]>;
  // the portal courses someone picks, each once
  abstract picked(): Promise<string[]>;
}
