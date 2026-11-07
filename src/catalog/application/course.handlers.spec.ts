import { NO_INSTANCE, PortalId } from '@app/kernel';
import { CourseSlugTakenError, UnknownCourseError } from '../domain/errors.js';
import { AcademicYear, CourseName, Slug } from '../domain/values.js';
import {
  CreateCourseCommand,
  LinkPortalCourseCommand,
  UnlinkPortalCourseCommand,
  UpsertPortalCourseCommand,
} from './commands.js';
import { onFakes } from './handlers.fakes.js';

const portalCourse = {
  portal: PortalId.parse('canvas'),
  instance: NO_INSTANCE,
  externalId: '1388',
};
const year = AcademicYear.parse(2026);

async function catalog() {
  const fakes = await onFakes();
  const { id } = await fakes.commands.execute(
    new UpsertPortalCourseCommand({
      ...portalCourse,
      name: 'OS 2026/27',
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

    const { id } = await create('os');

    expect(courses.bySlug.get('os')?.id).toBe(id);
    await expect(create('os')).rejects.toBeInstanceOf(CourseSlugTakenError);
  });

  it('link a portal course to one course, moving it when linked again', async () => {
    const { commands, create, links, portalCourseId } = await catalog();
    const os = await create('os');
    await create('os-old');

    for (const slug of ['os-old', 'os'])
      await commands.execute(
        new LinkPortalCourseCommand(Slug.parse(slug), portalCourse, year),
      );

    expect([...links.byPortalCourse.values()]).toEqual([
      { portalCourseId, courseId: os.id, year },
    ]);
  });

  it('refuse an unknown course, and link a portal course the hub has nothing of all the same', async () => {
    const { commands, create, links, portalCourses } = await catalog();
    const os = await create('os');
    const unsent = { ...portalCourse, externalId: 'unsent' };

    await expect(
      commands.execute(
        new LinkPortalCourseCommand(Slug.parse('nope'), portalCourse, null),
      ),
    ).rejects.toBeInstanceOf(UnknownCourseError);
    await commands.execute(
      new LinkPortalCourseCommand(Slug.parse('os'), unsent, null),
    );
    const id = await portalCourses.recordId(unsent);
    expect(links.byPortalCourse.get(id!)).toMatchObject({ courseId: os.id });

    // sent later, under the id the link named
    const sent = await commands.execute(
      new UpsertPortalCourseCommand({
        ...unsent,
        name: 'OS',
        url: null,
        meta: null,
      }),
    );
    expect(sent.id).toBe(id);
  });

  it('unlink a portal course, saying whether it was linked, an unknown one too', async () => {
    const { commands, create } = await catalog();
    await create('os');
    await commands.execute(
      new LinkPortalCourseCommand(Slug.parse('os'), portalCourse, year),
    );

    const unlink = (externalId = portalCourse.externalId) =>
      commands.execute(
        new UnlinkPortalCourseCommand({ ...portalCourse, externalId }),
      );
    expect(await unlink()).toEqual({ changed: true });
    expect(await unlink()).toEqual({ changed: false });
    expect(await unlink('nope')).toEqual({ changed: false });
  });
});
