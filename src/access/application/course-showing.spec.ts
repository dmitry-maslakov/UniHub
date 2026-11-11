import { PortalId } from '@app/kernel';
import { FakeBus } from '../../../test/fake-bus.js';
import {
  HideCoursesCommand,
  ShowCoursesCommand,
  ViewingAccountsQuery,
} from '../../accounts/contracts.js';
import {
  CourseSlug,
  ListCoursesQuery,
  type CourseDto,
} from '../../catalog/contracts.js';
import { ReadScopeQuery } from '../../identity/contracts.js';
import { CourseShowing } from './course-showing.js';
import { NotReadableError } from './errors.js';

const [moodle, catalog] = ['moodle', 'catalog'].map((p) => PortalId.parse(p));
const slug = (s: string) => CourseSlug.parse(s);
const ofItsOwn = (id: string, portal: PortalId): CourseDto => ({
  id,
  slug: `${portal}~${id.slice(3)}`,
  name: id,
  portalCourses: [
    { id, portal, externalId: id.slice(3), name: id, url: null, year: null },
  ],
});
const courses = [
  ofItsOwn('pc-db', catalog),
  ofItsOwn('pc-os', catalog),
  ofItsOwn('pc-m1', moodle),
  ofItsOwn('pc-m2', moodle),
];

// ana reads m1 and m2 through her own account, hides m2, and picked the
// public catalog's os, shown with m1; she didn't pick db
function showing() {
  const bus = new FakeBus([
    [ReadScopeQuery, () => ({ granted: [], ownAccounts: true })],
    [
      ViewingAccountsQuery,
      () => ({
        portals: [moodle],
        accounts: ['ana-moodle'],
        picks: {
          portals: [catalog],
          courses: ['pc-os'],
          into: new Map([['pc-os', 'pc-m1']]),
        },
        hidden: ['pc-m2'],
      }),
    ],
    [ListCoursesQuery, () => courses],
  ]);
  const commands = () =>
    bus.sent.filter(
      (m) => m instanceof HideCoursesCommand || m instanceof ShowCoursesCommand,
    );
  return { service: new CourseShowing(bus.queries, bus.commands), commands };
}

describe('CourseShowing', () => {
  it('hides every portal course of the course, as the user sees it', async () => {
    const { service, commands } = showing();
    await service.hide('ana', slug('moodle~m1'));
    expect(commands()).toEqual([
      new HideCoursesCommand('ana', ['pc-m1', 'pc-os']),
    ]);
  });

  it("leaves a course hidden already, or a public portal's not picked, as it is", async () => {
    const { service, commands } = showing();
    await service.hide('ana', slug('moodle~m2'));
    await service.hide('ana', slug('catalog~db'));
    expect(commands()).toEqual([]);
  });

  it('shows a hidden course again, picking nothing', async () => {
    const { service, commands } = showing();
    await service.show('ana', slug('moodle~m2'));
    expect(commands()).toEqual([new ShowCoursesCommand('ana', ['pc-m2'], [])]);
  });

  it("shows a public portal's course the user didn't pick by picking it", async () => {
    const { service, commands } = showing();
    await service.show('ana', slug('catalog~db'));
    expect(commands()).toEqual([
      new ShowCoursesCommand(
        'ana',
        ['pc-db'],
        [{ portal: catalog, externalId: 'db' }],
      ),
    ]);
  });

  it("answers a course the user doesn't read as not found, and changes nothing", async () => {
    const { service, commands } = showing();
    const gone = slug('catalog~gone');
    for (const act of [
      () => service.hide('ana', gone),
      () => service.show('ana', gone),
    ])
      await expect(act()).rejects.toThrowError(new NotReadableError('course'));
    // moved into m1: no course of that slug
    await expect(service.hide('ana', slug('catalog~os'))).rejects.toThrowError(
      new NotReadableError('course'),
    );
    expect(commands()).toEqual([]);
  });
});
