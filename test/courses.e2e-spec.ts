import { Test, type TestingModule } from '@nestjs/testing';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AppModule } from '../src/app.module.js';
import {
  CourseSlugTakenError,
  CreateCourseCommand,
  LinkPortalCourseCommand,
  ListCoursesQuery,
  UnknownCourseError,
  UnknownReferenceError,
  UnlinkPortalCourseCommand,
  UpsertPortalCourseCommand,
} from '../src/catalog/contracts.js';

describe('courses', () => {
  let app: TestingModule;
  let commands: CommandBus;
  let queries: QueryBus;

  const portalCourse = (portal: string, externalId: string, name: string) =>
    commands.execute(
      new UpsertPortalCourseCommand({
        portal,
        externalId,
        name,
        url: null,
        meta: null,
      }),
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
    await commands.execute(
      new CreateCourseCommand('ar', 'Arhitektura računara'),
    );
    await commands.execute(
      new LinkPortalCourseCommand('ar', 'acs-t', 'arsiit', null),
    );
    await commands.execute(
      new LinkPortalCourseCommand('ar', 'canvas-t', '1388', 2026),
    );
    await commands.execute(
      new LinkPortalCourseCommand('ar', 'canvas-t', '1201', 2025),
    );

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
    await commands.execute(new CreateCourseCommand('ar-old', 'AR (old)'));
    await commands.execute(
      new LinkPortalCourseCommand('ar-old', 'canvas-t', '1201', 2025),
    );

    expect((await course('ar'))!.portalCourses).toHaveLength(2);
    expect((await course('ar-old'))!.portalCourses).toMatchObject([
      { externalId: '1201' },
    ]);
  });

  it('unlinks a portal course', async () => {
    expect(
      await commands.execute(new UnlinkPortalCourseCommand('canvas-t', '1201')),
    ).toEqual({ changed: true });
    expect((await course('ar-old'))!.portalCourses).toEqual([]);
  });

  it('refuses a taken slug, an unknown course or portal course', async () => {
    await expect(
      commands.execute(new CreateCourseCommand('ar', 'again')),
    ).rejects.toBeInstanceOf(CourseSlugTakenError);
    await expect(
      commands.execute(new CreateCourseCommand('Not A Slug', 'x')),
    ).rejects.toThrow('invalid course slug');
    await expect(
      commands.execute(
        new LinkPortalCourseCommand('nope', 'acs-t', 'arsiit', null),
      ),
    ).rejects.toBeInstanceOf(UnknownCourseError);
    await expect(
      commands.execute(
        new LinkPortalCourseCommand('ar', 'acs-t', 'nope', null),
      ),
    ).rejects.toBeInstanceOf(UnknownReferenceError);
  });
});
