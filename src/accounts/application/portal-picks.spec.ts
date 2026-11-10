import { PortalId } from '@app/kernel';
import {
  OwnPortalCourseQuery,
  PickMatchesQuery,
} from '../../access/contracts.js';
import { CourseSlug, ListPortalCatalogQuery } from '../../catalog/contracts.js';
import { NotPickableError } from '../domain/errors.js';
import { PortalLinks } from '../domain/portal-links.js';
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

  it('picks a course of the catalog once, and shows one the user hid', async () => {
    const { service, picks: rows, hidden, bus } = await picks();
    await hidden.hide('ana', ['pc-os', 'pc-net']);
    await service.pick('ana', CATALOG, 'os');
    await service.pick('ana', CATALOG, 'os');

    expect(rows.rows).toEqual([{ userId: 'ana', portalCourseId: 'pc-os' }]);
    expect(await hidden.ofUser('ana')).toEqual(['pc-net']);
    expect(bus.sent).toContainEqual(new ListPortalCatalogQuery(CATALOG, 'os'));
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

  it("unpicks the user's pick alone, and its hiding with it", async () => {
    const { service, picks: rows, hidden } = await picks();
    await service.pick('ana', CATALOG, 'os');
    await service.pick('bo', CATALOG, 'os');
    await hidden.hide('ana', ['pc-os']);
    await hidden.hide('bo', ['pc-os']);

    await service.unpick('ana', CATALOG, 'os');
    expect(rows.rows).toEqual([{ userId: 'bo', portalCourseId: 'pc-os' }]);
    expect([...hidden.rows]).toEqual(['bo:pc-os']);
  });

  it("removes a deleted user's picks, nobody else's", async () => {
    const { service, picks: rows } = await picks();
    await service.pick('ana', CATALOG, 'os');
    await service.pick('ana', CATALOG, 'net');
    await service.pick('bo', CATALOG, 'net');

    await service.removeAllOf('ana');
    expect(rows.rows).toEqual([{ userId: 'bo', portalCourseId: 'pc-net' }]);
  });

  it("changes nothing for a pick the user hasn't, or a course the catalog hasn't", async () => {
    const { service, picks: rows } = await picks();
    await service.pick('bo', CATALOG, 'net');
    await service.unpick('ana', CATALOG, 'net');
    await service.unpick('ana', CATALOG, 'gone');
    expect(rows.rows).toEqual([{ userId: 'bo', portalCourseId: 'pc-net' }]);
  });

  it('unpicks whatever the portal is now', async () => {
    const { service, picks: rows } = await picks();
    rows.rows.push({ userId: 'ana', portalCourseId: 'pc-lms-1' });
    await service.unpick('ana', LMS, 'lms-1');
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
    const ofUserWithInto = vi.spyOn(rows, 'ofUserWithInto');
    expect(await service.of('ana')).toEqual({
      portals: [],
      courses: [],
      into: new Map(),
    });
    expect(await service.counts('ana')).toEqual(new Map());
    expect(ofUser).not.toHaveBeenCalled();
    expect(ofUserWithInto).not.toHaveBeenCalled();
    expect(bus.sent).toEqual([]);
  });

  it("asks a public portal's connector for its whole catalog, picked or not, and no other portal's for anything", async () => {
    const { service } = await picks();
    await service.pick('ana', CATALOG, 'os');

    expect(await service.wantedOf(CATALOG)).toEqual(['os', 'net']);
    expect(await service.wantedOf(LMS)).toEqual([]);
  });
});
