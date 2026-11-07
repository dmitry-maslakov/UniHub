import { Query } from '@nestjs/cqrs';
import type { CourseSlug } from '../../catalog/contracts.js';

// What other modules ask access: what a user reads, as they see it.

// The portal course of the user's own account that the course of this
// slug holds, as the user sees their courses (grouping.ts): the first of
// them, what a pick shown with that course goes with. Null for a course
// they don't read, or read through no account of their own.
export class OwnPortalCourseQuery extends Query<string | null> {
  constructor(
    public readonly userId: string,
    public readonly slug: CourseSlug,
  ) {
    super();
  }
}

// a pick as its user sees it: the course of theirs it's shown with, and
// the one it may go with (suggestions.ts), each by its slug
export interface PickMatch {
  into: string | null;
  suggestedInto: string | null;
}

// Each of these portal courses the user picked, as they see it now: the
// course it's shown with is the one that holds the portal course of their
// own it goes with, none while they don't read that one through their
// account; the suggestion counts only what they see. One an admin linked
// to a course stays there (README, Matching): neither, whatever it goes
// with.
export class PickMatchesQuery extends Query<Map<string, PickMatch>> {
  constructor(
    public readonly userId: string,
    public readonly portalCourseIds: readonly string[],
  ) {
    super();
  }
}
