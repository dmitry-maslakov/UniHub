// Of a user's picks, those in each public portal's catalog now: what the
// user sees picked. One left of a portal no longer public, or of a course
// gone from its catalog, isn't: nowhere to unpick it.
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

// A user's picks, by the portal courses' ids, and of them those the user
// shows with a course of their own, each by the portal course of their own
// account it goes with
export interface UserPicks {
  courses: string[];
  into: Map<string, string>;
}

// Users' picks of public portals' courses (README, Public portals), by the
// portal courses' ids: the courses of those portals each user shows among
// their own. Everyone reads them all, picked or not.
export abstract class PickRepository {
  // the portal courses the user picked
  abstract ofUser(userId: string): Promise<string[]>;
  // the same, with what each goes with, by one read
  abstract ofUserWithInto(userId: string): Promise<UserPicks>;
  abstract add(userId: string, portalCourseId: string): Promise<void>;
  // the user's pick shown with that portal course of theirs, or on its own
  // (null)
  abstract showWith(
    userId: string,
    portalCourseId: string,
    into: string | null,
  ): Promise<void>;
  abstract remove(userId: string, portalCourseId: string): Promise<void>;
  abstract removeAllOf(userId: string): Promise<void>;
}
