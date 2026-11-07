import { PortalId } from '@app/kernel';
import {
  OwnPortalCourseQuery,
  PickMatchesQuery,
} from '../../access/contracts.js';
import { CourseSlug, ListPortalCatalogQuery } from '../../catalog/contracts.js';
import { NotPickableError, TooManyPicksError } from '../domain/errors.js';
import { MAX_PICKS } from '../domain/picks.js';
import { PortalLinks } from '../domain/portal-links.js';
import { GRACE_DAYS } from '../domain/wanted-course.js';
import { catalogBus, picksOnFakes } from './accounts.fakes.js';
import { NotInCatalogError, NotYourCourseError } from './errors.js';

const portal = (id: string) => PortalId.parse(id);
const [CATALOG, LMS] = ['catalog', 'lms'].map(portal);
const now = new Date('2026-11-07T12:00:00Z');
const at = (days: number) => new Date(now.getTime() + days * 86_400_000);

// catalog's courses of the public portal, and one of a portal read with
// users' own accounts
const course = (externalId: string, name = externalId) => ({
  id: `pc-${externalId}`,
  externalId,
  name,
  url: null,
  since: at(-100),
});
const catalogs = {
  catalog: [course('os', 'Operativni sistemi'), course('net', 'Mreže')],
  lms: [course('lms-1')],
};

// access, as it answers: ana reads a course of her own, lms~c1, through
// her account, its portal course pc-c1; os is suggested to go with it
const mine = CourseSlug.parse('lms~c1');
const access: Parameters<typeof catalogBus>[1] = [
  [
    OwnPortalCourseQuery,
    ({ userId, slug }: OwnPortalCourseQuery) =>
      userId === 'ana' && slug === mine ? 'pc-c1' : null,
  ],
  [
    PickMatchesQuery,
    ({ portalCourseIds }: PickMatchesQuery) =>
      new Map(
        portalCourseIds.map((id) => [
          id,
          { into: null, suggestedInto: id === 'pc-os' ? mine : null },
        ]),
      ),
  ],
];

async function picks(catalog = catalogs.catalog) {
  const links = new PortalLinks(
    new Map([
      [CATALOG, { mode: 'public', adminsOnly: false }],
      [LMS, { mode: 'token', adminsOnly: false }],
    ]),
  );
  const bus = catalogBus({ ...catalogs, catalog }, access);
  return { ...(await picksOnFakes(links, bus)), bus };
}

describe('PortalPicks', () => {
  it("browses a public portal's catalog with the user's picks marked, and no other portal's", async () => {
    const { service, bus } = await picks();
    await service.pick('ana', CATALOG, 'os');

    const page = await service.catalog(
      'ana',
      CATALOG,
      { q: 'MREZE', offset: 0, limit: 50 },
      now,
    );
    expect(page).toEqual({
      total: 1,
      courses: [expect.objectContaining({ externalId: 'net', picked: false })],
    });
    expect(
      (
        await service.catalog('ana', CATALOG, { offset: 0, limit: 50 }, now)
      ).courses
        .filter((c) => c.picked)
        .map((c) => c.externalId),
    ).toEqual(['os']);
    // what the picks on the page go with, as access answers: none asked
    // for a page without one
    expect(bus.sent.filter((q) => q instanceof PickMatchesQuery)).toEqual([
      new PickMatchesQuery('ana', ['pc-os']),
    ]);
    for (const other of [LMS, portal('elsewhere')])
      await expect(
        service.catalog('ana', other, { offset: 0, limit: 50 }),
      ).rejects.toThrow(new NotPickableError(other));
  });

  it('adds to each pick on the page the course it goes with, and to the others none', async () => {
    const { service } = await picks();
    await service.pick('ana', CATALOG, 'os');

    const { courses } = await service.catalog(
      'ana',
      CATALOG,
      { offset: 0, limit: 50 },
      now,
    );
    expect(courses).toEqual([
      {
        externalId: 'net',
        name: 'Mreže',
        url: null,
        picked: false,
        isNew: false,
        into: null,
        suggestedInto: null,
      },
      expect.objectContaining({
        externalId: 'os',
        picked: true,
        into: null,
        suggestedInto: mine,
      }),
    ]);
  });

  it('shows a pick with a course the user reads through their own account, on its own again, and as it was when left out', async () => {
    const { service, picks: rows, bus } = await picks();
    await service.pick('ana', CATALOG, 'os', mine);
    expect(rows.rows).toEqual([
      { userId: 'ana', portalCourseId: 'pc-os', into: 'pc-c1' },
    ]);
    expect(bus.sent).toContainEqual(new OwnPortalCourseQuery('ana', mine));
    expect((await service.of('ana')).into).toEqual(
      new Map([['pc-os', 'pc-c1']]),
    );

    await service.pick('ana', CATALOG, 'os');
    expect(rows.rows[0].into).toBe('pc-c1');
    await service.pick('ana', CATALOG, 'os', null);
    expect(rows.rows).toEqual([{ userId: 'ana', portalCourseId: 'pc-os' }]);
  });

  it("refuses to show a pick with a course that isn't the user's own, and picks nothing", async () => {
    const { service, picks: rows } = await picks();
    await expect(service.pick('bo', CATALOG, 'os', mine)).rejects.toThrow(
      new NotYourCourseError(),
    );
    expect(rows.rows).toEqual([]);
  });

  it("picks a course of the catalog, wanted for good from then on, under the user's lock", async () => {
    const { service, picks: rows, wanted, bus } = await picks();
    await service.pick('ana', CATALOG, 'os');
    await service.pick('ana', CATALOG, 'os');

    expect(rows.rows).toEqual([{ userId: 'ana', portalCourseId: 'pc-os' }]);
    expect(rows.locked).toEqual(['ana', 'ana']);
    expect([...wanted.rows]).toEqual([['pc-os', null]]);
    expect(bus.sent).toContainEqual(new ListPortalCatalogQuery(CATALOG));
  });

  it('refuses a course the catalog has not, and a portal that is not public', async () => {
    const { service, picks: rows } = await picks();
    await expect(service.pick('ana', CATALOG, 'gone')).rejects.toThrow(
      new NotInCatalogError(CATALOG, 'gone'),
    );
    await expect(service.pick('ana', LMS, 'lms-1')).rejects.toThrow(
      new NotPickableError(LMS),
    );
    expect(rows.rows).toEqual([]);
  });

  it(`refuses a pick past ${MAX_PICKS} of those it counts, but not one picked already`, async () => {
    const more = Array.from({ length: MAX_PICKS - 1 }, (_, i) =>
      course(`more-${i}`),
    );
    const { service, picks: rows } = await picks([
      ...catalogs.catalog,
      ...more,
    ]);
    for (const { id } of more)
      rows.rows.push({ userId: 'ana', portalCourseId: id });
    await service.pick('ana', CATALOG, 'os');

    await expect(service.pick('ana', CATALOG, 'net')).rejects.toThrow(
      new TooManyPicksError(MAX_PICKS),
    );
    await expect(service.pick('ana', CATALOG, 'os')).resolves.toBeUndefined();
    expect(await service.counts('ana')).toEqual(
      new Map([[CATALOG, MAX_PICKS]]),
    );
    // someone else's are theirs
    await service.pick('bo', CATALOG, 'net');
  });

  it('leaves out of the limit, as out of the count, a pick of a portal no longer public or of a course gone from its catalog', async () => {
    const more = Array.from({ length: MAX_PICKS - 1 }, (_, i) =>
      course(`more-${i}`),
    );
    const { service, picks: rows } = await picks([
      ...catalogs.catalog,
      ...more,
    ]);
    for (const { id } of more)
      rows.rows.push({ userId: 'ana', portalCourseId: id });
    rows.rows.push(
      { userId: 'ana', portalCourseId: 'pc-lms-1' },
      { userId: 'ana', portalCourseId: 'pc-gone' },
    );

    await service.pick('ana', CATALOG, 'os');
    expect(await service.counts('ana')).toEqual(
      new Map([[CATALOG, MAX_PICKS]]),
    );
    await expect(service.pick('ana', CATALOG, 'net')).rejects.toThrow(
      new TooManyPicksError(MAX_PICKS),
    );
  });

  it(`keeps a course wanted ${GRACE_DAYS} days past its last pick, not past one of several`, async () => {
    const { service, wanted } = await picks();
    await service.pick('ana', CATALOG, 'os');
    await service.pick('bo', CATALOG, 'os');

    await service.unpick('ana', CATALOG, 'os', now);
    expect(wanted.rows.get('pc-os')).toBeNull();
    await service.unpick('bo', CATALOG, 'os', now);
    expect(wanted.rows.get('pc-os')).toEqual(at(GRACE_DAYS));
  });

  it("removes a deleted user's picks, nobody else's, and starts the grace of each course no one picks now", async () => {
    const { service, picks: rows, wanted } = await picks();
    await service.pick('ana', CATALOG, 'os');
    await service.pick('ana', CATALOG, 'net');
    await service.pick('bo', CATALOG, 'net');

    await service.removeAllOf('ana', now);
    expect(rows.rows).toEqual([{ userId: 'bo', portalCourseId: 'pc-net' }]);
    expect(Object.fromEntries(wanted.rows)).toEqual({
      'pc-os': at(GRACE_DAYS),
      'pc-net': null,
    });
  });

  it("changes nothing for a pick the user hasn't, or a course the catalog hasn't", async () => {
    const { service, wanted } = await picks();
    await service.unpick('ana', CATALOG, 'net', now);
    await service.unpick('ana', CATALOG, 'gone', now);
    expect(wanted.rows.size).toBe(0);
  });

  it('unpicks whatever the portal is now', async () => {
    const { service, picks: rows } = await picks();
    rows.rows.push({ userId: 'ana', portalCourseId: 'pc-lms-1' });
    await service.unpick('ana', LMS, 'lms-1', now);
    expect(rows.rows).toEqual([]);
  });

  it("gives the public portals and the user's picks to read by, and how many of each catalog", async () => {
    const { service, picks: rows } = await picks();
    await service.pick('ana', CATALOG, 'net');
    // left of when lms was public
    rows.rows.push({ userId: 'ana', portalCourseId: 'pc-lms-1' });

    expect(await service.of('ana')).toEqual({
      portals: [CATALOG],
      courses: ['pc-lms-1', 'pc-net'],
      into: new Map(),
    });
    expect(await service.counts('ana')).toEqual(new Map([[CATALOG, 1]]));
    expect(await service.counts('bo')).toEqual(new Map([[CATALOG, 0]]));
  });

  it('asks nothing with no public portal', async () => {
    const bus = catalogBus(catalogs);
    const { service, picks: rows } = await picksOnFakes(
      new PortalLinks(new Map()),
      bus,
    );
    const ofUser = vi.spyOn(rows, 'ofUser');
    expect(await service.of('ana')).toEqual({
      portals: [],
      courses: [],
      into: new Map(),
    });
    expect(await service.counts('ana')).toEqual(new Map());
    expect(ofUser).not.toHaveBeenCalled();
    expect(bus.sent).toEqual([]);
  });

  it("answers a public portal's wanted courses, picked or in their grace, by its ids", async () => {
    const { service, wanted } = await picks();
    await service.pick('ana', CATALOG, 'os');
    wanted.rows.set('pc-net', at(1));
    wanted.rows.set('pc-lms-1', null);

    expect(await service.wantedOf(CATALOG, now)).toEqual(['os', 'net']);
    // past its grace, before the reconcile drops it
    expect(await service.wantedOf(CATALOG, at(2))).toEqual(['os']);
    expect(await service.wantedOf(LMS, now)).toEqual([]);
  });

  it('reconciles each course wanted with its picks: grace for none, for good for some, gone past it', async () => {
    const { service, picks: rows, wanted } = await picks();
    // a picker deleted: the course picked by none, wanted for good still
    wanted.rows.set('pc-os', null);
    // picked within its grace, one by a race
    rows.rows.push({ userId: 'ana', portalCourseId: 'pc-net' });
    wanted.rows.set('pc-net', at(3));
    // past its grace, and one in it
    wanted.rows.set('pc-old', at(-1));
    wanted.rows.set('pc-left', at(2));
    // picked, and wanted by no row
    rows.rows.push({ userId: 'bo', portalCourseId: 'pc-new' });

    await service.reconcile(now);
    expect(Object.fromEntries(wanted.rows)).toEqual({
      'pc-os': at(GRACE_DAYS),
      'pc-net': null,
      'pc-left': at(2),
      'pc-new': null,
    });
  });

  it('lets a pick made meanwhile win over the reconcile', async () => {
    const { service, wanted } = await picks();
    wanted.rows.set('pc-os', at(-1));
    const all = wanted.all.bind(wanted);
    vi.spyOn(wanted, 'all').mockImplementation(async () => {
      const found = await all();
      // picked after the reconcile looked
      await service.pick('ana', CATALOG, 'os');
      return found;
    });

    await service.reconcile(now);
    expect(wanted.rows.get('pc-os')).toBeNull();
  });
});
