import type { INestApplication } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { NO_INSTANCE, PortalId } from '@app/kernel';
import {
  AcademicYear,
  CourseName,
  CourseSlugTakenError,
  CreateCourseCommand,
  LinkPortalCourseCommand,
  ListCoursesQuery,
  Slug,
  UnlinkPortalCourseCommand,
  UpsertPortalCourseCommand,
} from '../src/catalog/contracts.js';
import { bootApp } from './app.js';

// courses as postgres keeps them: links upserted by their portal course,
// portal courses read back in their order, slugs unique
const ref = (portal: string, externalId: string) => ({
  portal: PortalId.parse(portal),
  instance: NO_INSTANCE,
  externalId,
});

describe('courses', () => {
  let app: INestApplication;
  let commands: CommandBus;
  let queries: QueryBus;

  const portalCourse = (portal: string, externalId: string, name: string) =>
    commands.execute(
      new UpsertPortalCourseCommand({
        ...ref(portal, externalId),
        name,
        url: null,
        meta: null,
      }),
    );
  const create = (slug: string, name: string) =>
    commands.execute(
      new CreateCourseCommand(Slug.parse(slug), CourseName.parse(name)),
    );
  const link = (
    slug: string,
    portal: string,
    externalId: string,
    year: number | null,
  ) =>
    commands.execute(
      new LinkPortalCourseCommand(
        Slug.parse(slug),
        ref(portal, externalId),
        year === null ? null : AcademicYear.parse(year),
      ),
    );
  const course = async (slug: string) =>
    // as an admin reads them
    (
      await queries.execute(
        new ListCoursesQuery({
          accounts: [],
          shared: { courses: null, except: [] },
          picks: { portals: [], courses: [] },
        }),
      )
    ).find((c) => c.slug === slug);

  beforeAll(async () => {
    app = await bootApp();
    commands = app.get(CommandBus);
    queries = app.get(QueryBus);

    await portalCourse('blackboard-t', 'os-101', 'Operating systems');
    await portalCourse('canvas-t', '1201', 'OS 2025/26');
    await portalCourse('canvas-t', '1388', 'OS 2026/27');
  });

  afterAll(() => app.close());

  it('makes a course of courses from several portals and years', async () => {
    await create('os', 'Operating systems');
    await link('os', 'blackboard-t', 'os-101', null);
    await link('os', 'canvas-t', '1388', 2026);
    await link('os', 'canvas-t', '1201', 2025);

    expect(await course('os')).toMatchObject({
      name: 'Operating systems',
      portalCourses: [
        { portal: 'canvas-t', externalId: '1201', year: 2025 },
        { portal: 'canvas-t', externalId: '1388', year: 2026 },
        { portal: 'blackboard-t', externalId: 'os-101', year: null },
      ],
    });
  });

  it('moves a portal course when it is linked to another course', async () => {
    await create('os-old', 'OS (old)');
    await link('os-old', 'canvas-t', '1201', 2025);

    expect((await course('os'))!.portalCourses).toHaveLength(2);
    expect((await course('os-old'))!.portalCourses).toMatchObject([
      { externalId: '1201' },
    ]);
  });

  it('unlinks a portal course', async () => {
    expect(
      await commands.execute(
        new UnlinkPortalCourseCommand(ref('canvas-t', '1201')),
      ),
    ).toEqual({ changed: true });
    expect((await course('os-old'))!.portalCourses).toEqual([]);
  });

  // the unique slug is postgres'; the rest of what's refused is checked
  // on fakes (course.handlers.spec)
  it('refuses a slug another course has', async () => {
    await expect(create('os', 'again')).rejects.toBeInstanceOf(
      CourseSlugTakenError,
    );
  });
});
