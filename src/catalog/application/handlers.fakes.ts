import { randomUUID } from 'node:crypto';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { ClsModule } from 'nestjs-cls';
import {
  ClsPluginTransactional,
  NoOpTransactionalAdapter,
} from '@nestjs-cls/transactional';
import type { CatalogAggregate, Ingested } from '../domain/aggregate.js';
import type { CourseLink } from '../domain/course-link/course-link.js';
import { CourseLinkRepository } from '../domain/course-link/course-link.repository.js';
import type { Course } from '../domain/course/course.js';
import { CourseRepository } from '../domain/course/course.repository.js';
import type { CatalogEvent } from '../domain/events.js';
import { Item, type ItemState } from '../domain/item/item.js';
import { ItemRepository } from '../domain/item/item.repository.js';
import {
  PortalCourse,
  type PortalCourseState,
} from '../domain/portal-course/portal-course.js';
import { PortalCourseRepository } from '../domain/portal-course/portal-course.repository.js';
import {
  PortalFile,
  type FileState,
} from '../domain/portal-file/portal-file.js';
import { PortalFileRepository } from '../domain/portal-file/portal-file.repository.js';
import type { PortalRef, PortalSite } from '../domain/portal-ref.js';
import type { Shown } from '../domain/publication.js';
import type { Sighting, ViewChange } from '../domain/view/view.js';
import {
  ViewRepository,
  type Kind,
  type Stamp,
  type VersionData,
} from '../domain/view/view.repository.js';
import {
  CreateCourseHandler,
  LinkPortalCourseHandler,
  UnlinkPortalCourseHandler,
} from './course.handlers.js';
import {
  RemoveFileHandler,
  SetFileContentHandler,
  UpsertFileHandler,
} from './file.handlers.js';
import { RemoveItemHandler, UpsertItemHandler } from './item.handlers.js';
import { UpsertPortalCourseHandler } from './portal-course.handlers.js';
import { References } from './references.js';
import {
  ForgetAccountHandler,
  StoreBytesHandler,
  ViewCourseHandler,
  ViewCoursesHandler,
} from './view.handlers.js';

// In-memory ports for the handlers' unit tests: the records as last saved,
// by the portal's site and id, and the events save() would have written to
// the outbox.

export const key = ({ portal, instance, externalId }: PortalRef) =>
  JSON.stringify([portal, instance, externalId]);

// keeps what save() was given, and loads it anew, as a database would
class InMemory<S extends Ingested, T extends CatalogAggregate<S>> {
  readonly records = new Map<string, S>();
  readonly events: CatalogEvent[] = [];
  writes = 0;

  constructor(private readonly restore: (state: S) => T) {}

  async getForUpdate(ref: PortalRef) {
    const state = this.records.get(key(ref));
    return state ? this.restore({ ...state }) : null;
  }

  findByRef(ref: PortalRef) {
    return this.getForUpdate(ref);
  }

  async save(record: T) {
    if (record.dirty) {
      this.records.set(key(record.snapshot.ref), record.snapshot);
      this.writes++;
    }
    this.events.push(...record.getUncommittedEvents());
    record.uncommit();
  }
}

export class InMemoryFiles
  extends InMemory<FileState, PortalFile>
  implements PortalFileRepository
{
  constructor() {
    super((state) => PortalFile.restore(state));
  }
}

export class InMemoryItems
  extends InMemory<ItemState, Item>
  implements ItemRepository
{
  constructor() {
    super((state) => Item.restore(state));
  }
}

export class InMemoryPortalCourses
  extends InMemory<PortalCourseState, PortalCourse>
  implements PortalCourseRepository
{
  // the ids of the portal courses links named before any account sent them
  readonly named = new Map<string, string>();

  constructor() {
    super((state) => PortalCourse.restore(state));
  }

  async recordId(ref: PortalRef) {
    return this.records.get(key(ref))?.id ?? this.named.get(key(ref)) ?? null;
  }

  async keep(ref: PortalRef) {
    const id = (await this.recordId(ref)) ?? randomUUID();
    if (!this.records.has(key(ref))) this.named.set(key(ref), id);
    return id;
  }
}

export class InMemoryCourses implements CourseRepository {
  readonly bySlug = new Map<string, Course>();

  async add(course: Course) {
    if (this.bySlug.has(course.slug)) return false;
    this.bySlug.set(course.slug, course);
    return true;
  }

  async findBySlug(slug: string) {
    return this.bySlug.get(slug) ?? null;
  }
}

export class InMemoryLinks implements CourseLinkRepository {
  readonly byPortalCourse = new Map<string, CourseLink>();

  async save(link: CourseLink) {
    this.byPortalCourse.set(link.portalCourseId, link);
  }

  async remove(portalCourseId: string) {
    return this.byPortalCourse.delete(portalCourseId);
  }
}

interface Version {
  id: string;
  kind: Kind;
  recordId: string;
  data: VersionData[Kind];
  hash: string | null;
}

export interface Sight extends Shown {
  open: boolean;
  hiddenFrom: Date | null;
}

// users' accounts' views: versions by record and fingerprint, each
// account's sights of them by the version's id
export class InMemoryViews extends ViewRepository {
  readonly records = new Map<string, string>();
  readonly versions = new Map<string, Version>();
  readonly sights = new Map<string, Map<string, Sight>>();
  // versions made, by kind
  readonly made: Version[] = [];

  async recordIds(
    kind: Kind,
    { portal, instance }: PortalSite,
    externalIds: readonly string[],
    make = true,
  ) {
    const ids = new Map<string, string>();
    for (const externalId of externalIds) {
      const key = JSON.stringify([kind, portal, instance, externalId]);
      if (make && !this.records.has(key)) this.records.set(key, randomUUID());
      const id = this.records.get(key);
      if (id) ids.set(externalId, id);
    }
    return ids;
  }

  async versionOf<K extends Kind>(
    kind: K,
    recordId: string,
    fingerprint: string,
    data: VersionData[K],
  ) {
    const key = `${recordId}:${fingerprint}`;
    const had = this.versions.get(key);
    if (had) return had.id;
    const version = { id: randomUUID(), kind, recordId, data, hash: null };
    this.versions.set(key, version);
    this.made.push(version);
    return version.id;
  }

  // the account's sights, by version id
  of(account: string) {
    let sights = this.sights.get(account);
    if (!sights) this.sights.set(account, (sights = new Map()));
    return sights;
  }

  version(id: string) {
    return [...this.versions.values()].find((v) => v.id === id)!;
  }

  async sightings(kind: Kind, account: string, course: string | null) {
    return [...this.of(account)]
      .filter(([id, sight]) => {
        const { kind: k, data } = this.version(id);
        const inCourse =
          course === null ||
          ('portalCourseId' in data && data.portalCourseId === course);
        return k === kind && sight.hiddenFrom === null && inCourse;
      })
      .map(([versionId, { open }]): Sighting => ({
        recordId: this.version(versionId).recordId,
        versionId,
        open,
      }));
  }

  async apply(_: Kind, account: string, change: ViewChange, at: Shown) {
    const sights = this.of(account);
    for (const { versionId, open } of change.show)
      sights.set(versionId, { open, ...at, hiddenFrom: null });
    for (const { versionId, open } of change.reopen)
      Object.assign(sights.get(versionId)!, { open, openFrom: at.openFrom });
    for (const { versionId } of change.hide)
      sights.get(versionId)!.hiddenFrom = at.shownFrom;
  }

  async forget(account: string) {
    this.sights.delete(account);
  }

  async storeBytes(fileId: string, stamp: Stamp, hash: string) {
    const waiting = [...this.versions.values()].filter((v) => {
      const data = v.data as VersionData['file'];
      return (
        v.kind === 'file' &&
        v.recordId === fileId &&
        v.hash === null &&
        data.size === stamp.size &&
        data.sourceUpdatedAt?.getTime() === stamp.sourceUpdatedAt?.getTime()
      );
    });
    for (const version of waiting) version.hash = hash;
    return waiting.length > 0;
  }
}

// catalog's command handlers on the fakes, behind a real CommandBus;
// @Transactional() runs, without a database
export async function onFakes() {
  const fakes = {
    files: new InMemoryFiles(),
    items: new InMemoryItems(),
    portalCourses: new InMemoryPortalCourses(),
    courses: new InMemoryCourses(),
    links: new InMemoryLinks(),
    views: new InMemoryViews(),
  };
  const module = await Test.createTestingModule({
    imports: [
      CqrsModule.forRoot(),
      ClsModule.forRoot({
        plugins: [
          new ClsPluginTransactional({
            adapter: new NoOpTransactionalAdapter({
              tx: {},
              disableWarning: true,
            }),
          }),
        ],
      }),
    ],
    providers: [
      UpsertPortalCourseHandler,
      UpsertItemHandler,
      RemoveItemHandler,
      UpsertFileHandler,
      SetFileContentHandler,
      RemoveFileHandler,
      CreateCourseHandler,
      LinkPortalCourseHandler,
      UnlinkPortalCourseHandler,
      References,
      ViewCoursesHandler,
      ViewCourseHandler,
      StoreBytesHandler,
      ForgetAccountHandler,
      { provide: ViewRepository, useValue: fakes.views },
      { provide: PortalFileRepository, useValue: fakes.files },
      { provide: ItemRepository, useValue: fakes.items },
      { provide: PortalCourseRepository, useValue: fakes.portalCourses },
      { provide: CourseRepository, useValue: fakes.courses },
      { provide: CourseLinkRepository, useValue: fakes.links },
    ],
  }).compile();
  await module.init();
  return { commands: module.get(CommandBus), ...fakes };
}
