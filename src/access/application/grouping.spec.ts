import { PortalId } from '@app/kernel';
import type { CourseDto, Viewers } from '../../catalog/contracts.js';
import { ownIn, regroup, slugsOf } from './grouping.js';

const [canvas, moodle, catalog] = ['canvas', 'moodle', 'catalog'].map((p) =>
  PortalId.parse(p),
);
// ana reads canvas as shared, moodle through her own account, catalog as
// everyone does, a public portal; she picked db, net and ai of it
const viewers: Viewers = {
  accounts: ['ana-moodle'],
  shared: { courses: ['os-id'], except: [moodle, catalog] },
  open: [catalog],
};
const picked = new Set(['pc-db', 'pc-net', 'pc-ai']);
const showing = { picked, hidden: new Set<string>() };
const hiding = (...ids: string[]) => ({ picked, hidden: new Set(ids) });

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
// and m2 are ana's own; db, ai and ml the public portal's, of their own,
// ml not picked
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
    const [os] = regroup(courses, viewers, new Map(), showing);
    expect(os.portalCourses.map(({ id, via }) => [id, via])).toEqual([
      ['pc-os', 'link'],
      ['pc-m0', 'account'],
      ['pc-net', 'public'],
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
    const grouped = regroup(courses, viewers, into, showing);
    expect(slugs(grouped)).toEqual([
      ['os', ['pc-os', 'pc-m0', 'pc-net', 'pc-ml']],
      ['moodle~m1', ['pc-m1', 'pc-ai', 'pc-db']],
      ['moodle~m2', ['pc-m2']],
    ]);
    expect(grouped[1]).toMatchObject({
      sources: [catalog, moodle],
      portalCourses: [{ via: 'account' }, { via: 'public' }, { via: 'public' }],
    });
  });

  it('leaves a pick an admin linked to a course in it, whatever it goes with', () => {
    const grouped = regroup(
      courses,
      viewers,
      new Map([['pc-net', 'pc-m1']]),
      showing,
    );
    expect(slugs(grouped)).toEqual(
      slugs(regroup(courses, viewers, new Map(), showing)),
    );
  });

  it("leaves a pick on its own when what it goes with isn't read through the user's own account now", () => {
    const into = new Map([
      // an account unlinked, so a portal course no longer listed
      ['pc-db', 'pc-gone'],
      // read through the shared account, or a pick
      ['pc-ai', 'pc-os'],
      ['pc-ml', 'pc-db'],
    ]);
    expect(slugs(regroup(courses, viewers, into, showing))).toEqual(
      slugs(regroup(courses, viewers, new Map(), showing)),
    );
  });
});

describe('regroup, what the user shows', () => {
  const states = (grouped: ReturnType<typeof regroup>) =>
    Object.fromEntries(
      grouped.map(({ slug, listed, hidden }) => [slug, { listed, hidden }]),
    );

  it("lists a course granted, of the user's own account or picked, and not a public portal's they didn't pick, which is hidden", () => {
    expect(states(regroup(courses, viewers, new Map(), showing))).toEqual({
      os: { listed: true, hidden: false },
      'catalog~ai': { listed: true, hidden: false },
      'catalog~db': { listed: true, hidden: false },
      'catalog~ml': { listed: false, hidden: true },
      'moodle~m1': { listed: true, hidden: false },
      'moodle~m2': { listed: true, hidden: false },
    });
  });

  it("hides a course once each portal course of the user's in it is hidden, and lists it still", () => {
    const grouped = regroup(
      courses,
      viewers,
      new Map(),
      hiding('pc-m1', 'pc-ai', 'pc-os', 'pc-m0'),
    );
    expect(states(grouped)).toMatchObject({
      'moodle~m1': { listed: true, hidden: true },
      'catalog~ai': { listed: true, hidden: true },
      // the net pick in it is shown still
      os: { listed: true, hidden: false },
      'moodle~m2': { listed: true, hidden: false },
    });
    expect(
      states(
        regroup(
          courses,
          viewers,
          new Map(),
          hiding('pc-os', 'pc-m0', 'pc-net'),
        ),
      ).os,
    ).toEqual({ listed: true, hidden: true });
  });

  it("counts a public portal's course not picked for nothing in a course of the user's", () => {
    const into = new Map([['pc-db', 'pc-m1']]);
    const m1 = regroup(courses, viewers, into, hiding('pc-m1')).find(
      (c) => c.slug === 'moodle~m1',
    );
    // the db pick moved in is shown still
    expect(m1).toMatchObject({ listed: true, hidden: false });
    const unpicked = { picked: new Set<string>(), hidden: new Set(['pc-m0']) };
    const [os] = regroup(courses, viewers, new Map(), unpicked);
    // pc-os is shown, the net course in it not picked
    expect(os).toMatchObject({ slug: 'os', listed: true, hidden: false });
  });

  it("lists a course granted that holds nothing of the user's, never hidden while empty", () => {
    const empty = { id: 'os-id', slug: 'os', name: 'OS', portalCourses: [] };
    const publicOnly = {
      ...empty,
      portalCourses: [part('pc-ml', catalog)],
    };
    expect(regroup([empty], viewers, new Map(), showing)[0]).toMatchObject({
      listed: true,
      hidden: false,
    });
    expect(regroup([publicOnly], viewers, new Map(), showing)[0]).toMatchObject(
      { listed: true, hidden: true },
    );
    // an admin is granted every course an admin made, and no portal course
    const admin = { ...viewers, shared: { ...viewers.shared, courses: null } };
    expect(
      states(
        regroup(
          [
            { ...publicOnly, id: 'x-id', slug: 'x' },
            ofItsOwn('pc-ml', catalog),
          ],
          admin,
          new Map(),
          showing,
        ),
      ),
    ).toEqual({
      x: { listed: true, hidden: true },
      'catalog~ml': { listed: false, hidden: true },
    });
  });
});

describe('ownIn', () => {
  it("finds the course each portal course of the user's own accounts is in", () => {
    expect(ownIn(regroup(courses, viewers, new Map(), showing))).toEqual(
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
    const grouped = regroup(
      courses,
      viewers,
      new Map([['pc-db', 'pc-m1']]),
      showing,
    );
    const slugOf = slugsOf(grouped);
    expect(slugOf.get('os-id')).toBe('os');
    expect(slugOf.get('pc-net')).toBe('os');
    expect(slugOf.get('pc-db')).toBe('moodle~m1');
    expect(slugOf.get('pc-ai')).toBe('catalog~ai');
  });
});
