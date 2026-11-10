import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { PortalId } from '@app/kernel';
import { HiddenCourseRepository } from '../domain/hidden-courses.js';
import { PortalPicks } from './portal-picks.js';

// a public portal's course, as its catalog names it
export interface CatalogCourse {
  portal: PortalId;
  externalId: string;
}

// The courses a user hides and shows (README, Hidden courses), by their
// portal courses: which are the user's to hide or show is the caller's to
// say (access). A public portal's course no pick shows is shown by picking
// it.
@Injectable()
export class HiddenCourses {
  constructor(
    private readonly hidden: HiddenCourseRepository,
    private readonly picks: PortalPicks,
  ) {}

  of(userId: string) {
    return this.hidden.ofUser(userId);
  }

  hide(userId: string, portalCourseIds: readonly string[]) {
    return this.hidden.hide(userId, portalCourseIds);
  }

  // these shown again, and those picked
  @Transactional()
  async show(
    userId: string,
    portalCourseIds: readonly string[],
    pick: readonly CatalogCourse[] = [],
  ) {
    await this.hidden.show(userId, portalCourseIds);
    for (const { portal, externalId } of pick)
      await this.picks.pick(userId, portal, externalId);
  }

  // a deleted user's
  removeAllOf(userId: string) {
    return this.hidden.removeAllOf(userId);
  }
}
