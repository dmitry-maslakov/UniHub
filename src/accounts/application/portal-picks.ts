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
import {
  checkRoom,
  PickRepository,
  pickedIn,
  type UserPicks,
} from '../domain/picks.js';
import { PortalLinks } from '../domain/portal-links.js';
import {
  WantedCourse,
  WantedCourseRepository,
} from '../domain/wanted-course.js';
import { NotInCatalogError, NotYourCourseError } from './errors.js';

// What a user reads of the public portals: the courses they picked, and
// of those the ones they show with a course of their own, each by the
// portal course of their own account it goes with
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

// a course not picked: nothing of it is the user's to read, so none to
// show it with nor to suggest
const ON_ITS_OWN: PickMatch = { into: null, suggestedInto: null };

// Users' picks of public portals' courses (README, Public portals): each
// public portal's catalog is its connector's courses, as catalog has them,
// and a user picks from it what they read there, with no grant. A course
// picked is wanted, its connector asked to sync it (Wanted), and stays so
// for a grace once no one picks it; the hourly reconcile ends the grace
// of what no pick keeps. A pick may go with a course the user reads through
// an account of their own (README, Matching), which access answers for, as
// it does which one it may.
@Injectable()
export class PortalPicks {
  constructor(
    private readonly links: PortalLinks,
    private readonly picks: PickRepository,
    private readonly wanted: WantedCourseRepository,
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

  // The course picked, and wanted for good. Picked again, it's no new
  // pick; one past MAX_PICKS of those the user sees picked is refused.
  // `into` shows it with the course of that slug, if the user reads it
  // through an account of their own, null on its own, and leaves it as it
  // was if left out.
  @Transactional()
  async pick(
    userId: string,
    portal: PortalId,
    externalId: string,
    into?: CourseSlug | null,
  ) {
    this.links.checkPicking(portal);
    const picked = await this.picks.lockOf(userId);
    const catalogs = await this.catalogs();
    const course = catalogs
      .get(portal)
      ?.find((course) => course.externalId === externalId);
    if (!course) throw new NotInCatalogError(portal, externalId);
    const own = into ? await this.ownPortalCourse(userId, into) : into;
    checkRoom([...pickedIn(catalogs, picked).values()].flat(), course.id);
    await this.picks.add(userId, course.id);
    if (own !== undefined) await this.picks.showWith(userId, course.id, own);
    await this.wanted.save(new WantedCourse(course.id));
  }

  // The pick gone, whatever the portal's mode is now; the course's last,
  // it's wanted for its grace alone. No pick of the user's, and nothing
  // changes.
  @Transactional()
  async unpick(
    userId: string,
    portal: PortalId,
    externalId: string,
    now = new Date(),
  ) {
    const [course] = await this.catalogOf(portal, externalId);
    if (!course) return;
    const left = await this.picks.remove(userId, course.id);
    if (left === 0)
      await this.wanted.save(new WantedCourse(course.id).picked(false, now));
  }

  // the public portals and the user's picks, all of them: what the user
  // reads of those portals, the ones no longer public left out by them
  async of(userId: string): Promise<Picks> {
    const portals = this.links.readByPicks();
    if (!portals.length) return { portals, courses: [], into: new Map() };
    return { portals, ...(await this.picks.ofUserWithInto(userId)) };
  }

  // how many courses of each public portal's catalog the user picked: the
  // picks the user sees, and the ones MAX_PICKS counts
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

  // A deleted user's picks, all of them, and the grace of each course no
  // one picks now: the reconcile catches it too, should this fail
  @Transactional()
  async removeAllOf(userId: string, now = new Date()) {
    for (const id of await this.picks.removeAllOf(userId))
      await this.wanted.save(new WantedCourse(id).picked(false, now));
  }

  // The portal's courses its connector is asked to sync: picked now, or in
  // their grace. Nothing, of a portal that isn't public: picks read
  // nothing there.
  async wantedOf(portal: PortalId, now = new Date()) {
    if (this.links.of(portal).mode !== 'public') return [];
    const [rows, catalog] = await Promise.all([
      this.wanted.all(),
      this.catalogOf(portal),
    ]);
    const wanted = new Set(
      rows.filter((row) => !row.goneAt(now)).map((row) => row.portalCourseId),
    );
    return catalog
      .filter(({ id }) => wanted.has(id))
      .map(({ externalId }) => externalId);
  }

  // Each course wanted as its picks are now: one no one picks starts its
  // grace (two last picks gone at once, or a deleted user's whose removal
  // failed), one picked again leaves it, one past it goes, and one picked
  // is wanted. Each change only if the row is still as found, so a pick
  // meanwhile wins.
  async reconcile(now = new Date()) {
    const [rows, picked] = await Promise.all([
      this.wanted.all(),
      this.picks.picked(),
    ]);
    const picks = new Set(picked);
    for (const row of rows) {
      const course = row.picked(picks.has(row.portalCourseId), now);
      if (course.goneAt(now)) await this.wanted.replace(row, null);
      else if (course !== row) await this.wanted.replace(row, course);
      picks.delete(row.portalCourseId);
    }
    for (const id of picks) await this.wanted.save(new WantedCourse(id));
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
