import { PortalId } from '@app/kernel';
import { PortalLinks } from '../domain/portal-links.js';
import { GRACE_DAYS } from '../domain/wanted-course.js';
import { catalogBus, picksOnFakes } from './accounts.fakes.js';

const CATALOG = PortalId.parse('catalog');
const now = new Date('2026-11-10T12:00:00Z');
const grace = new Date(now.getTime() + GRACE_DAYS * 86_400_000);
const course = (externalId: string) => ({
  id: `pc-${externalId}`,
  externalId,
  name: externalId,
  url: null,
  since: now,
});

// a public portal with two courses; pc-own is a portal course of some
// other portal, which no pick reads
async function switches() {
  const links = new PortalLinks(
    new Map([[CATALOG, { mode: 'public', adminsOnly: false }]]),
  );
  const bus = catalogBus({ catalog: [course('os'), course('net')] });
  const fakes = await picksOnFakes(links, bus);
  return {
    ...fakes,
    service: fakes.courseSwitches,
    portalPicks: fakes.service,
  };
}

describe('CourseSwitches', () => {
  it("hides courses and shows them again, each user's own", async () => {
    const { service } = await switches();
    await service.set('ana', ['pc-own', 'pc-os'], 'hidden', now);
    await service.set('bo', ['pc-own'], 'hidden', now);
    expect(await service.of('ana')).toEqual({
      hidden: ['pc-os', 'pc-own'],
      off: [],
    });

    await service.set('ana', ['pc-own'], 'shown', now);
    expect(await service.of('ana')).toEqual({ hidden: ['pc-os'], off: [] });
    expect(await service.of('bo')).toEqual({ hidden: ['pc-own'], off: [] });
  });

  it('keeps a hidden pick picked, so its course is still wanted', async () => {
    const { service, portalPicks, picks, wanted } = await switches();
    await portalPicks.pick('ana', CATALOG, 'os');
    await service.set('ana', ['pc-os'], 'hidden', now);

    expect(picks.rows).toEqual([{ userId: 'ana', portalCourseId: 'pc-os' }]);
    expect(wanted.rows.get('pc-os')).toBeNull();
  });

  it('turns a course off, and one that was hidden, and on again', async () => {
    const { service } = await switches();
    await service.set('ana', ['pc-own'], 'hidden', now);
    await service.set('ana', ['pc-own'], 'off', now);
    expect(await service.of('ana')).toEqual({ hidden: [], off: ['pc-own'] });

    await service.set('ana', ['pc-own'], 'shown', now);
    expect(await service.of('ana')).toEqual({ hidden: [], off: [] });
  });

  it('turns a picked course off by unpicking it: its last pick, and it is wanted for its grace alone', async () => {
    const { service, portalPicks, picks, wanted } = await switches();
    await portalPicks.pick('ana', CATALOG, 'os');
    await portalPicks.pick('ana', CATALOG, 'net');
    await portalPicks.pick('bo', CATALOG, 'net');
    await service.set('ana', ['pc-os'], 'hidden', now);

    await service.set('ana', ['pc-own', 'pc-os', 'pc-net'], 'off', now);
    expect(picks.rows).toEqual([{ userId: 'bo', portalCourseId: 'pc-net' }]);
    expect(Object.fromEntries(wanted.rows)).toEqual({
      'pc-os': grace,
      'pc-net': null,
    });
    // no row of a pick gone: picked again, it's shown
    expect(await service.of('ana')).toEqual({ hidden: [], off: ['pc-own'] });
  });

  it("drops a pick's hiding when it's unpicked in the catalog", async () => {
    const { service, portalPicks } = await switches();
    await portalPicks.pick('ana', CATALOG, 'os');
    await service.set('ana', ['pc-os'], 'hidden', now);

    await portalPicks.unpick('ana', CATALOG, 'os', now);
    expect(await service.of('ana')).toEqual({ hidden: [], off: [] });
  });

  it("removes a deleted user's, nobody else's", async () => {
    const { service } = await switches();
    await service.set('ana', ['pc-own'], 'off', now);
    await service.set('bo', ['pc-own'], 'off', now);

    await service.removeAllOf('ana');
    expect(await service.of('ana')).toEqual({ hidden: [], off: [] });
    expect(await service.of('bo')).toEqual({ hidden: [], off: ['pc-own'] });
  });
});
