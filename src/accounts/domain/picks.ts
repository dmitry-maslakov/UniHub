import { TooManyPicksError } from './errors.js';

// A user picks at most this many courses of public portals' catalogs: each
// one is a course its connector is asked to sync
export const MAX_PICKS = 100;

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
  // the same, and no other pick of the user's is made till the transaction
  // ends: two at once can't both find room for one more
  abstract lockOf(userId: string): Promise<string[]>;
  abstract add(userId: string, portalCourseId: string): Promise<void>;
  // the user's pick gone, and how many users pick it still; null if the
  // user didn't
  abstract remove(
    userId: string,
    portalCourseId: string,
  ): Promise<number | null>;
  // the portal courses someone picks, each once
  abstract picked(): Promise<string[]>;
}
