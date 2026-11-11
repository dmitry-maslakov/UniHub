import { PortalId } from '@app/kernel';
import { PortalLinks } from '../domain/portal-links.js';
import { catalogBus, picksOnFakes } from './accounts.fakes.js';

const CATALOG = PortalId.parse('catalog');
const course = (externalId: string) => ({
  id: `pc-${externalId}`,
  externalId,
  name: externalId,
  url: null,
  since: new Date('2026-11-01T00:00:00Z'),
});

// a public portal with two courses; pc-own is a portal course of some
// other portal
async function hiddenCourses() {
  const links = new PortalLinks(
    new Map([[CATALOG, { mode: 'public', adminsOnly: false }]]),
  );
  const bus = catalogBus({ catalog: [course('os'), course('net')] });
  const fakes = await picksOnFakes(links, bus);
  return { ...fakes, service: fakes.hiddenCourses, portalPicks: fakes.service };
}

describe('HiddenCourses', () => {
  it("hides courses and shows them again, each user's own", async () => {
    const { service } = await hiddenCourses();
    await service.hide('ana', ['pc-own', 'pc-os']);
    await service.hide('ana', ['pc-own']);
    await service.hide('bo', ['pc-own']);
    expect(await service.of('ana')).toEqual(['pc-os', 'pc-own']);

    await service.show('ana', ['pc-own']);
    expect(await service.of('ana')).toEqual(['pc-os']);
    expect(await service.of('bo')).toEqual(['pc-own']);
  });

  it('keeps a hidden pick picked, with what it goes with', async () => {
    const { service, portalPicks, picks } = await hiddenCourses();
    await portalPicks.pick('ana', CATALOG, 'os');
    await service.hide('ana', ['pc-os']);

    expect(picks.rows).toEqual([{ userId: 'ana', portalCourseId: 'pc-os' }]);
  });

  it("shows a public portal's course no pick shows by picking it", async () => {
    const { service, picks } = await hiddenCourses();
    await service.hide('ana', ['pc-own']);
    await service.show(
      'ana',
      ['pc-own', 'pc-net'],
      [{ portal: CATALOG, externalId: 'net' }],
    );

    expect(await service.of('ana')).toEqual([]);
    expect(picks.rows).toEqual([{ userId: 'ana', portalCourseId: 'pc-net' }]);
  });

  it("removes a deleted user's, nobody else's", async () => {
    const { service } = await hiddenCourses();
    await service.hide('ana', ['pc-own']);
    await service.hide('bo', ['pc-own']);

    await service.removeAllOf('ana');
    expect(await service.of('ana')).toEqual([]);
    expect(await service.of('bo')).toEqual(['pc-own']);
  });
});
