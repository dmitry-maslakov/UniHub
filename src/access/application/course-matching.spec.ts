import { PortalId } from '@app/kernel';
import { FakeBus } from '../../../test/fake-bus.js';
import { sha256 } from '../../../test/sha256.js';
import { ViewingAccountsQuery } from '../../accounts/contracts.js';
import {
  CourseSlug,
  ListCoursesQuery,
  ListVisibleContentQuery,
  type CourseDto,
  type Viewers,
  type VisibleContentDto,
} from '../../catalog/contracts.js';
import { ReadScopeQuery } from '../../identity/contracts.js';
import { CourseMatching } from './course-matching.js';

const [canvas, moodle, catalog] = ['canvas', 'moodle', 'catalog'].map((p) =>
  PortalId.parse(p),
);
const [h1, h2, h3] = ['h1', 'h2', 'h3'].map(sha256);

// ana is granted net, of canvas, read as shared; reads moodle~m1 through
// her own account; picked catalog's os and db, db to go with m1
const viewers: Viewers = {
  accounts: ['ana-moodle'],
  shared: { courses: ['net-id'], except: [moodle, catalog] },
  open: [catalog],
};
const ofItsOwn = (id: string, portal: PortalId): CourseDto => ({
  id,
  slug: `${portal}~${id.slice(3)}`,
  name: id,
  portalCourses: [
    { id, portal, externalId: id.slice(3), name: id, url: null, year: null },
  ],
});
const courses: CourseDto[] = [
  {
    id: 'net-id',
    slug: 'net',
    name: 'Networks',
    portalCourses: [
      {
        id: 'pc-net',
        portal: canvas,
        externalId: 'net',
        name: 'Networks',
        url: null,
        year: 2026,
      },
    ],
  },
  ofItsOwn('pc-os', catalog),
  ofItsOwn('pc-db', catalog),
  ofItsOwn('pc-m1', moodle),
];
// what ana's view opens: os shares two contents with m1, and three with
// the course she reads through the hub's account
const content = (portalCourseId: string, hash = h1): VisibleContentDto => ({
  fileId: `${portalCourseId}-${hash.slice(0, 4)}`,
  courseId: portalCourseId,
  portalCourseId,
  hash,
  name: 'f.pdf',
  path: '',
});
const contents = [
  ...[h1, h2, h3].map((h) => content('pc-os', h)),
  ...[h1, h2].map((h) => content('pc-m1', h)),
  ...[h1, h2, h3].map((h) => content('pc-net', h)),
];

function matching(listed = courses, seen = contents) {
  const queries = new FakeBus([
    [ReadScopeQuery, () => ({ granted: ['net-id'], ownAccounts: true })],
    [
      ViewingAccountsQuery,
      () => ({
        portals: [moodle],
        accounts: viewers.accounts,
        picks: {
          portals: viewers.open,
          courses: ['pc-os', 'pc-db'],
          into: new Map([['pc-db', 'pc-m1']]),
        },
        hidden: [],
      }),
    ],
    [ListCoursesQuery, () => listed],
    [
      ListVisibleContentQuery,
      ({ portalCourseIds }: ListVisibleContentQuery) =>
        seen.filter((c) => portalCourseIds?.includes(c.portalCourseId)),
    ],
  ]);
  return { queries, matching: new CourseMatching(queries.queries) };
}

describe('CourseMatching', () => {
  it('finds the portal course of her own account a course holds, and none of a course she reads otherwise', async () => {
    const { matching: m } = matching();
    expect(await m.ownPortalCourse('ana', CourseSlug.parse('moodle~m1'))).toBe(
      'pc-m1',
    );
    for (const slug of ['net', 'catalog~os', 'nope'])
      expect(await m.ownPortalCourse('ana', CourseSlug.parse(slug))).toBe(null);
  });

  it('answers what each pick goes with, and suggests from her own courses alone', async () => {
    const { matching: m } = matching();
    expect(await m.matches('ana', ['pc-os', 'pc-db'])).toEqual(
      new Map([
        ['pc-os', { into: null, suggestedInto: 'moodle~m1' }],
        ['pc-db', { into: 'moodle~m1', suggestedInto: null }],
      ]),
    );
  });

  it('answers neither a course nor a suggestion for a pick an admin linked, whatever it goes with', async () => {
    // an admin linked db to algo: there it stays, though she chose m1 and
    // db shares two contents with it
    const algo: CourseDto = {
      id: 'algo-id',
      slug: 'algo',
      name: 'Algorithms',
      portalCourses: ofItsOwn('pc-db', catalog).portalCourses,
    };
    const { matching: m } = matching(
      [...courses.filter(({ id }) => id !== 'pc-db'), algo],
      [...contents, ...[h1, h2].map((h) => content('pc-db', h))],
    );
    expect(await m.matches('ana', ['pc-os', 'pc-db'])).toEqual(
      new Map([
        ['pc-os', { into: null, suggestedInto: 'moodle~m1' }],
        ['pc-db', { into: null, suggestedInto: null }],
      ]),
    );
  });

  it('counts only what her viewers see of her own portal courses and the picks asked for', async () => {
    const { matching: m, queries } = matching();
    await m.matches('ana', ['pc-os']);
    expect(
      queries.sent.filter((q) => q instanceof ListVisibleContentQuery),
    ).toEqual([new ListVisibleContentQuery(viewers, ['pc-m1', 'pc-os'])]);
  });

  it('asks for no content without a course of her own, and a pick goes with none of a course no longer hers', async () => {
    const { matching: m, queries } = matching(
      courses.filter(({ id }) => id !== 'pc-m1'),
    );
    expect(await m.matches('ana', ['pc-os', 'pc-db'])).toEqual(
      new Map([
        ['pc-os', { into: null, suggestedInto: null }],
        ['pc-db', { into: null, suggestedInto: null }],
      ]),
    );
    expect(
      queries.sent.filter((q) => q instanceof ListVisibleContentQuery),
    ).toEqual([]);
  });
});
