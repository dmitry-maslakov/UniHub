import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import {
  CourseSwitchRepository,
  type CourseState,
} from '../domain/course-switches.js';
import { PortalPicks } from './portal-picks.js';

// The courses a user hides or turned off (README, Hidden and off), by
// their portal courses. Hiding is a convenience: a hidden course is read
// as before by every route, and marked for the web app to leave out of its
// lists. Off is the user's reads cut: none of it is theirs to read, by any
// route, till they turn it on. A public portal's course is read by its
// pick alone, so turned off its pick goes, and its sync with the last one
// (PortalPicks); any other is still synced. Which portal courses are the
// user's to switch is the caller's to say (access).
@Injectable()
export class CourseSwitches {
  constructor(
    private readonly switches: CourseSwitchRepository,
    private readonly picks: PortalPicks,
  ) {}

  of(userId: string) {
    return this.switches.ofUser(userId);
  }

  @Transactional()
  async set(
    userId: string,
    portalCourseIds: readonly string[],
    state: CourseState,
    now = new Date(),
  ) {
    if (state === 'shown') return this.switches.clear(userId, portalCourseIds);
    if (state === 'hidden')
      return this.switches.set(userId, portalCourseIds, state);
    const unpicked = await this.picks.drop(userId, portalCourseIds, now);
    await this.switches.set(
      userId,
      portalCourseIds.filter((id) => !unpicked.includes(id)),
      state,
    );
  }

  // a deleted user's
  removeAllOf(userId: string) {
    return this.switches.removeAllOf(userId);
  }
}
