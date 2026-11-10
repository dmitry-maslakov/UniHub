// How a user keeps a course of theirs (README, Hidden and off): shown;
// hidden, read as before by every route and marked for the web app to
// leave out of its lists; or off, read by none
export const COURSE_STATES = ['shown', 'hidden', 'off'] as const;
export type CourseState = (typeof COURSE_STATES)[number];

// the portal courses a user hides, and those they turned off
export interface Switched {
  hidden: string[];
  off: string[];
}

// Users' hidden and turned off courses, by the portal courses' ids; one
// with no row is shown
export abstract class CourseSwitchRepository {
  abstract ofUser(userId: string): Promise<Switched>;
  abstract set(
    userId: string,
    portalCourseIds: readonly string[],
    state: Exclude<CourseState, 'shown'>,
  ): Promise<void>;
  // shown again
  abstract clear(
    userId: string,
    portalCourseIds: readonly string[],
  ): Promise<void>;
  abstract removeAllOf(userId: string): Promise<void>;
}
