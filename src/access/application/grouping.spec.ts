import { PortalId } from '@app/kernel';
import type { CourseDto, Viewers } from '../../catalog/contracts.js';
import { ownIn, regroup, slugsOf } from './grouping.js';

const [canvas, moodle, catalog] = ['canvas', 'moodle', 'catalog'].map((p) =>
  PortalId.parse(p),
);
// ana reads canvas as shared, moodle through her own account, catalog by
// her picks
const viewers: Viewers = {
  accounts: ['ana-moodle'],
  shared: { courses: ['os-id'], except: [moodle, catalog] },
  picks: { portals: [catalog], courses: ['pc-db', 'pc-net', 'pc-ai'] },
};

const part = (id: string, portal: PortalId, year: number | null = null) => ({
  id,
  portal,
  externalId: id.slice(3),
  name: id,
  url: null,
  year,
});
// a portal course no course links: a course of its own, its id the portal
// course's
const ofItsOwn = (id: string, portal: PortalId): CourseDto => ({
  id,
  slug: `${portal}~${id.slice(3)}`,
  name: id,
  portalCourses: [part(id, portal)],
});

// os is an admin's, of canvas, ana's moodle course and the net pick; m1
// and m2 are ana's own; db, ai and ml picks of their own
const courses: CourseDto[] = [
  {
    id: 'os-id',
    slug: 'os',
    name: 'OS',
    portalCourses: [
      part('pc-os', canvas, 2026),
      part('pc-m0', moodle, 2026),
      part('pc-net', catalog),
    ],
  },
  ofItsOwn('pc-ai', catalog),
  ofItsOwn('pc-db', catalog),
  ofItsOwn('pc-ml', catalog),
  ofItsOwn('pc-m1', moodle),
  ofItsOwn('pc-m2', moodle),
];
const slugs = (grouped: ReturnType<typeof regroup>) =>
  grouped.map(({ slug, portalCourses }) => [
    slug,
    portalCourses.map(({ id }) => id),
  ]);

describe('regroup', () => {
  it('tags each portal course by how the user reads it, and each course by its portals', () => {
    const [os] = regroup(courses, viewers, new Map());
    expect(os.portalCourses.map(({ id, via }) => [id, via])).toEqual([
      ['pc-os', 'link'],
      ['pc-m0', 'account'],
      ['pc-net', 'pick'],
    ]);
    expect(os.sources).toEqual([canvas, catalog, moodle]);
  });

  it("moves a pick of its own into the course holding the portal course of the user's own it goes with, after that course's own", () => {
    const into = new Map([
      ['pc-db', 'pc-m1'],
      ['pc-ai', 'pc-m1'],
      // an admin's course holds pc-m0
      ['pc-ml', 'pc-m0'],
    ]);
    const grouped = regroup(courses, viewers, into);
    expect(slugs(grouped)).toEqual([
      ['os', ['pc-os', 'pc-m0', 'pc-net', 'pc-ml']],
      ['moodle~m1', ['pc-m1', 'pc-ai', 'pc-db']],
      ['moodle~m2', ['pc-m2']],
    ]);
    expect(grouped[1]).toMatchObject({
      sources: [catalog, moodle],
      portalCourses: [{ via: 'account' }, { via: 'pick' }, { via: 'pick' }],
    });
  });

  it('leaves a pick an admin linked to a course in it, whatever it goes with', () => {
    const grouped = regroup(courses, viewers, new Map([['pc-net', 'pc-m1']]));
    expect(slugs(grouped)).toEqual(slugs(regroup(courses, viewers, new Map())));
  });

  it("leaves a pick on its own when what it goes with isn't read through the user's own account now", () => {
    const into = new Map([
      // an account unlinked, so a portal course no longer listed
      ['pc-db', 'pc-gone'],
      // read through the shared account, or a pick
      ['pc-ai', 'pc-os'],
      ['pc-ml', 'pc-db'],
    ]);
    expect(slugs(regroup(courses, viewers, into))).toEqual(
      slugs(regroup(courses, viewers, new Map())),
    );
  });
});

describe('ownIn', () => {
  it("finds the course each portal course of the user's own accounts is in", () => {
    expect(ownIn(regroup(courses, viewers, new Map()))).toEqual(
      new Map([
        ['pc-m0', 'os'],
        ['pc-m1', 'moodle~m1'],
        ['pc-m2', 'moodle~m2'],
      ]),
    );
  });
});

describe('slugsOf', () => {
  it("names a record's course by the id catalog gives it, a moved pick's by the course it's in", () => {
    const grouped = regroup(courses, viewers, new Map([['pc-db', 'pc-m1']]));
    const slugOf = slugsOf(grouped);
    expect(slugOf.get('os-id')).toBe('os');
    expect(slugOf.get('pc-net')).toBe('os');
    expect(slugOf.get('pc-db')).toBe('moodle~m1');
    expect(slugOf.get('pc-ai')).toBe('catalog~ai');
  });
});
