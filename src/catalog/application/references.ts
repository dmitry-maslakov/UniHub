import { Injectable } from '@nestjs/common';
import type { PortalId } from '@app/kernel';
import { UnknownReferenceError } from '../domain/errors.js';
import { ItemRepository } from '../domain/item/item.repository.js';
import { PortalCourseRepository } from '../domain/portal-course/portal-course.repository.js';
import type { PortalRef } from '../domain/portal-ref.js';

// What a record names by the portal's ids: an item its course, a file its
// course and post. A name the portal never sent is a bug in the plugin, so
// it fails instead of silently dropping the link.
@Injectable()
export class References {
  constructor(
    private readonly courses: PortalCourseRepository,
    private readonly items: ItemRepository,
  ) {}

  async portalCourse(ref: PortalRef) {
    const found = await this.courses.findByRef(ref);
    if (!found) throw new UnknownReferenceError(ref.portal, ref.externalId);
    return found;
  }

  async item(ref: PortalRef) {
    const found = await this.items.findByRef(ref);
    if (!found) throw new UnknownReferenceError(ref.portal, ref.externalId);
    return found;
  }

  // a name a record may leave out
  courseNamed(portal: PortalId, externalId: string | null) {
    return externalId === null
      ? null
      : this.portalCourse({ portal, externalId });
  }

  itemNamed(portal: PortalId, externalId: string | null) {
    return externalId === null ? null : this.item({ portal, externalId });
  }
}
