import { Test, type TestingModule } from '@nestjs/testing';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { PortalId } from '@app/kernel';
import { AppModule } from '../src/app.module.js';
import {
  AcademicYear,
  CourseName,
  CourseSlugTakenError,
  CreateCourseCommand,
  LinkPortalCourseCommand,
  ListCoursesQuery,
  Slug,
  UnknownCourseError,
  UnknownReferenceError,
  UnlinkPortalCourseCommand,
  UpsertPortalCourseCommand,
} from '../src/catalog/contracts.js';

const ref = (portal: string, externalId: string) => ({
  portal: PortalId.parse(portal),
  externalId,
});

describe('courses', () => {
  let app: TestingModule;
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
    (await queries.execute(new ListCoursesQuery())).find(
      (c) => c.slug === slug,
    );

  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await app.init();
    commands = app.get(CommandBus);
    queries = app.get(QueryBus);

    await portalCourse('acs-t', 'arsiit', 'Arhitektura računara SIIT');
    await portalCourse('canvas-t', '1201', 'AR 2025/26');
    await portalCourse('canvas-t', '1388', 'AR 2026/27');
  });

  afterAll(() => app.close());

  it('makes a course of courses from several portals and years', async () => {
    await create('ar', 'Arhitektura računara');
    await link('ar', 'acs-t', 'arsiit', null);
    await link('ar', 'canvas-t', '1388', 2026);
    await link('ar', 'canvas-t', '1201', 2025);

    expect(await course('ar')).toMatchObject({
      name: 'Arhitektura računara',
      portalCourses: [
        { portal: 'canvas-t', externalId: '1201', year: 2025 },
        { portal: 'canvas-t', externalId: '1388', year: 2026 },
        { portal: 'acs-t', externalId: 'arsiit', year: null },
      ],
    });
  });

  it('moves a portal course when it is linked to another course', async () => {
    await create('ar-old', 'AR (old)');
    await link('ar-old', 'canvas-t', '1201', 2025);

    expect((await course('ar'))!.portalCourses).toHaveLength(2);
    expect((await course('ar-old'))!.portalCourses).toMatchObject([
      { externalId: '1201' },
    ]);
  });

  it('unlinks a portal course', async () => {
    expect(
      await commands.execute(
        new UnlinkPortalCourseCommand(ref('canvas-t', '1201')),
      ),
    ).toEqual({ changed: true });
    expect((await course('ar-old'))!.portalCourses).toEqual([]);
  });

  // a slug that isn't one can't make a command at all: see values.spec and
  // the admin routes
  it('refuses a taken slug, an unknown course or portal course', async () => {
    await expect(create('ar', 'again')).rejects.toBeInstanceOf(
      CourseSlugTakenError,
    );
    await expect(link('nope', 'acs-t', 'arsiit', null)).rejects.toBeInstanceOf(
      UnknownCourseError,
    );
    await expect(link('ar', 'acs-t', 'nope', null)).rejects.toBeInstanceOf(
      UnknownReferenceError,
    );
  });
});
