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
import type { PortalRef } from '../domain/portal-ref.js';
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

// In-memory ports for the handlers' unit tests: the records as last saved,
// by the portal's id, and the events save() would have written to the
// outbox.

const key = ({ portal, externalId }: PortalRef) => `${portal}:${externalId}`;

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
  constructor() {
    super((state) => PortalCourse.restore(state));
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

// catalog's command handlers on the fakes, behind a real CommandBus;
// @Transactional() runs, without a database
export async function onFakes() {
  const fakes = {
    files: new InMemoryFiles(),
    items: new InMemoryItems(),
    portalCourses: new InMemoryPortalCourses(),
    courses: new InMemoryCourses(),
    links: new InMemoryLinks(),
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
