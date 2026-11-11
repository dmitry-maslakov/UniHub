import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import type { PortalId } from '@app/kernel';
import {
  OwnPortalCourseQuery,
  PickMatchesQuery,
  type PickMatch,
} from '../../access/contracts.js';
import {
  ListPortalCatalogQuery,
  type CourseSlug,
} from '../../catalog/contracts.js';
import {
  browse,
  type Browse,
  type CatalogEntry,
} from '../domain/catalog-page.js';
import { HiddenCourseRepository } from '../domain/hidden-courses.js';
import { PickRepository, pickedIn, type UserPicks } from '../domain/picks.js';
import { PortalLinks } from '../domain/portal-links.js';
import { NotInCatalogError, NotYourCourseError } from './errors.js';

// The public portals, the courses of them the user picked, and of those
// the ones they show with a course of their own, each by the portal course
// of their own account it goes with
export interface Picks extends UserPicks {
  portals: PortalId[];
}

// a course of a public portal's catalog as its user browses it, and the
// course of theirs it goes with, as they see it (PickMatchesQuery)
export interface CatalogCourseView
  extends Omit<CatalogEntry, 'id'>, PickMatch {}

export interface CatalogView {
  total: number;
  courses: CatalogCourseView[];
}

// a course not picked is no course of the user's: none to show it with,
// nor to suggest
const ON_ITS_OWN: PickMatch = { into: null, suggestedInto: null };

// Users' picks of public portals' courses (README, Public portals): each
// public portal's catalog is its connector's courses, as catalog has them.
// Everyone reads them all, with no grant, and its connector syncs them
// all (Wanted); a user picks from it the courses they show among their
// own. A pick may go with a course the user reads through an account of
// their own (README, Matching), which access answers for, as it does which
// one it may.
@Injectable()
export class PortalPicks {
  constructor(
    private readonly links: PortalLinks,
    private readonly picks: PickRepository,
    private readonly hidden: HiddenCourseRepository,
    private readonly queries: QueryBus,
  ) {}

  // A page of the portal's catalog as the user browses it, and of the
  // courses on it they picked, the courses of theirs each goes with
  async catalog(
    userId: string,
    portal: PortalId,
    page: Browse,
    now = new Date(),
  ): Promise<CatalogView> {
    this.links.checkPicking(portal);
    const [courses, picked] = await Promise.all([
      this.catalogOf(portal),
      this.picks.ofUser(userId),
    ]);
    const { total, courses: entries } = browse(
      courses,
      page,
      new Set(picked),
      now,
    );
    const shown = entries.filter((c) => c.picked).map(({ id }) => id);
    const matches = shown.length
      ? await this.queries.execute(new PickMatchesQuery(userId, shown))
      : new Map<string, PickMatch>();
    return {
      total,
      courses: entries.map(({ id, ...entry }) => ({
        ...entry,
        ...(matches.get(id) ?? ON_ITS_OWN),
      })),
    };
  }

  // The course picked, and shown if the user hid it; picked again, it's
  // no new pick. `into` shows it with the course of that slug, if the
  // user reads it through an account of their own, null on its own, and
  // leaves it as it was if left out.
  @Transactional()
  async pick(
    userId: string,
    portal: PortalId,
    externalId: string,
    into?: CourseSlug | null,
  ) {
    this.links.checkPicking(portal);
    const [course] = await this.catalogOf(portal, externalId);
    if (!course) throw new NotInCatalogError(portal, externalId);
    const own = into ? await this.ownPortalCourse(userId, into) : into;
    await this.picks.add(userId, course.id);
    if (own !== undefined) await this.picks.showWith(userId, course.id, own);
    await this.hidden.show(userId, [course.id]);
  }

  // The pick gone, whatever the portal's mode is now, and its hiding with
  // it: picked again, the course is shown. No pick of the user's, and
  // nothing changes.
  @Transactional()
  async unpick(userId: string, portal: PortalId, externalId: string) {
    const [course] = await this.catalogOf(portal, externalId);
    if (!course) return;
    await this.picks.remove(userId, course.id);
    await this.hidden.show(userId, [course.id]);
  }

  // the public portals and the user's picks, all of them: the ones of a
  // portal no longer public are left out by the portals
  async of(userId: string): Promise<Picks> {
    const portals = this.links.readByPicks();
    if (!portals.length) return { portals, courses: [], into: new Map() };
    return { portals, ...(await this.picks.ofUserWithInto(userId)) };
  }

  // how many courses of each public portal's catalog the user picked: the
  // picks the user sees
  async counts(userId: string): Promise<Map<PortalId, number>> {
    if (!this.links.readByPicks().length) return new Map();
    const [picked, catalogs] = await Promise.all([
      this.picks.ofUser(userId),
      this.catalogs(),
    ]);
    return new Map(
      [...pickedIn(catalogs, picked)].map(([portal, ids]) => [
        portal,
        ids.length,
      ]),
    );
  }

  // a deleted user's picks, all of them
  removeAllOf(userId: string) {
    return this.picks.removeAllOf(userId);
  }

  // The portal's courses its connector is asked to sync: its whole
  // catalog, as everyone reads all of it. Nothing, of a portal that isn't
  // public.
  async wantedOf(portal: PortalId) {
    if (this.links.of(portal).mode !== 'public') return [];
    const catalog = await this.catalogOf(portal);
    return catalog.map(({ externalId }) => externalId);
  }

  // the portal course of the user's own account a pick of theirs is to go
  // with, for the course of that slug
  private async ownPortalCourse(userId: string, slug: CourseSlug) {
    const own = await this.queries.execute(
      new OwnPortalCourseQuery(userId, slug),
    );
    if (own === null) throw new NotYourCourseError();
    return own;
  }

  private catalogOf(portal: PortalId, externalId?: string) {
    return this.queries.execute(new ListPortalCatalogQuery(portal, externalId));
  }

  // each public portal's catalog
  private async catalogs() {
    const portals = this.links.readByPicks();
    const catalogs = await Promise.all(portals.map((p) => this.catalogOf(p)));
    return new Map(portals.map((portal, i) => [portal, catalogs[i]]));
  }
}
