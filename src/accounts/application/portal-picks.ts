import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import type { PortalId } from '@app/kernel';
import { ListPortalCatalogQuery } from '../../catalog/contracts.js';
import { browse, type Browse } from '../domain/catalog-page.js';
import { checkRoom, PickRepository, pickedIn } from '../domain/picks.js';
import { PortalLinks } from '../domain/portal-links.js';
import {
  WantedCourse,
  WantedCourseRepository,
} from '../domain/wanted-course.js';
import { NotInCatalogError } from './errors.js';

// What a user reads of the public portals: the courses they picked
export interface Picks {
  portals: PortalId[];
  courses: string[];
}

// Users' picks of public portals' courses (README, Public portals): each
// public portal's catalog is its connector's courses, as catalog has them,
// and a user picks from it what they read there, with no grant. A course
// picked is wanted, its connector asked to sync it (Wanted), and stays so
// for a grace once no one picks it; the hourly reconcile ends the grace
// of what no pick keeps.
@Injectable()
export class PortalPicks {
  constructor(
    private readonly links: PortalLinks,
    private readonly picks: PickRepository,
    private readonly wanted: WantedCourseRepository,
    private readonly queries: QueryBus,
  ) {}

  // a page of the portal's catalog as the user browses it
  async catalog(
    userId: string,
    portal: PortalId,
    page: Browse,
    now = new Date(),
  ) {
    this.links.checkPicking(portal);
    const [courses, picked] = await Promise.all([
      this.catalogOf(portal),
      this.picks.ofUser(userId),
    ]);
    return browse(courses, page, new Set(picked), now);
  }

  // The course picked, and wanted for good. Picked again, it's no new
  // pick; one past MAX_PICKS of those the user sees picked is refused.
  @Transactional()
  async pick(userId: string, portal: PortalId, externalId: string) {
    this.links.checkPicking(portal);
    const picked = await this.picks.lockOf(userId);
    const catalogs = await this.catalogs();
    const course = catalogs
      .get(portal)
      ?.find((course) => course.externalId === externalId);
    if (!course) throw new NotInCatalogError(portal, externalId);
    checkRoom([...pickedIn(catalogs, picked).values()].flat(), course.id);
    await this.picks.add(userId, course.id);
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
    return {
      portals,
      courses: portals.length ? await this.picks.ofUser(userId) : [],
    };
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
