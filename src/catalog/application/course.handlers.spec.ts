import { PortalId } from '@app/kernel';
import {
  CourseSlugTakenError,
  UnknownCourseError,
  UnknownReferenceError,
} from '../domain/errors.js';
import { AcademicYear, CourseName, Slug } from '../domain/values.js';
import {
  CreateCourseCommand,
  LinkPortalCourseCommand,
  UnlinkPortalCourseCommand,
  UpsertPortalCourseCommand,
} from './commands.js';
import { onFakes } from './handlers.fakes.js';

const portalCourse = { portal: PortalId.parse('canvas'), externalId: '1388' };
const year = AcademicYear.parse(2026);

async function catalog() {
  const fakes = await onFakes();
  const { id } = await fakes.commands.execute(
    new UpsertPortalCourseCommand({
      ...portalCourse,
      name: 'AR 2026/27',
      url: null,
      meta: null,
    }),
  );
  const create = (slug: string) =>
    fakes.commands.execute(
      new CreateCourseCommand(Slug.parse(slug), CourseName.parse(slug)),
    );
  return { ...fakes, portalCourseId: id, create };
}

describe('course commands', () => {
  it('make a course, one per slug', async () => {
    const { create, courses } = await catalog();

    const { id } = await create('ar');

    expect(courses.bySlug.get('ar')?.id).toBe(id);
    await expect(create('ar')).rejects.toBeInstanceOf(CourseSlugTakenError);
  });

  it('link a portal course to one course, moving it when linked again', async () => {
    const { commands, create, links, portalCourseId } = await catalog();
    const ar = await create('ar');
    await create('ar-old');

    for (const slug of ['ar-old', 'ar'])
      await commands.execute(
        new LinkPortalCourseCommand(Slug.parse(slug), portalCourse, year),
      );

    expect([...links.byPortalCourse.values()]).toEqual([
      { portalCourseId, courseId: ar.id, year },
    ]);
  });

  it('refuse an unknown course or portal course', async () => {
    const { commands, create } = await catalog();
    await create('ar');

    await expect(
      commands.execute(
        new LinkPortalCourseCommand(Slug.parse('nope'), portalCourse, null),
      ),
    ).rejects.toBeInstanceOf(UnknownCourseError);
    await expect(
      commands.execute(
        new LinkPortalCourseCommand(
          Slug.parse('ar'),
          { ...portalCourse, externalId: 'nope' },
          null,
        ),
      ),
    ).rejects.toBeInstanceOf(UnknownReferenceError);
  });

  it('unlink a portal course, saying whether it was linked, and no unknown one', async () => {
    const { commands, create } = await catalog();
    await create('ar');
    await commands.execute(
      new LinkPortalCourseCommand(Slug.parse('ar'), portalCourse, year),
    );

    const unlink = (externalId = portalCourse.externalId) =>
      commands.execute(
        new UnlinkPortalCourseCommand({ ...portalCourse, externalId }),
      );
    expect(await unlink()).toEqual({ changed: true });
    expect(await unlink()).toEqual({ changed: false });
    await expect(unlink('nope')).rejects.toBeInstanceOf(UnknownReferenceError);
  });
});
