const DAY = 24 * 60 * 60 * 1000;

// How long a course stays wanted once no one picks it: a pick meanwhile
// finds its sync where it left off
export const GRACE_DAYS = 14;

// A public portal's course its connector is asked to sync (Wanted): for
// good while someone picks it, then till its grace ends, past which it's
// wanted no more and its connector keeps it as it was, frozen.
export class WantedCourse {
  constructor(
    readonly portalCourseId: string,
    // null while someone picks it
    readonly until: Date | null = null,
  ) {}

  // As it is once someone picks it, or once no one does: wanted for good
  // while picked; once not, till its grace ends, which runs from now
  // unless it runs already. Itself when that changes nothing.
  picked(picked: boolean, now: Date): WantedCourse {
    if (picked)
      return this.until ? new WantedCourse(this.portalCourseId) : this;
    if (this.until) return this;
    return new WantedCourse(
      this.portalCourseId,
      new Date(now.getTime() + GRACE_DAYS * DAY),
    );
  }

  goneAt(now: Date) {
    return this.until !== null && this.until <= now;
  }
}

// the courses wanted, by the portal courses' ids
export abstract class WantedCourseRepository {
  // every course wanted now or before: picked, or in its grace or past it
  abstract all(): Promise<WantedCourse[]>;
  abstract save(course: WantedCourse): Promise<void>;
  // `was`, as all() found it, made `course`, or dropped (null), only if
  // it's still as found: a pick meanwhile wins
  abstract replace(
    was: WantedCourse,
    course: WantedCourse | null,
  ): Promise<void>;
}
