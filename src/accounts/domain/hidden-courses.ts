// The courses each user hides (README, Hidden courses), by the portal
// courses' ids. Hiding is a convenience, never access: a hidden course is
// read as before by every route, search and MCP, and only left out of the
// user's list of courses. One with no row is shown.
export abstract class HiddenCourseRepository {
  abstract ofUser(userId: string): Promise<string[]>;
  abstract hide(
    userId: string,
    portalCourseIds: readonly string[],
  ): Promise<void>;
  abstract show(
    userId: string,
    portalCourseIds: readonly string[],
  ): Promise<void>;
  abstract removeAllOf(userId: string): Promise<void>;
}
