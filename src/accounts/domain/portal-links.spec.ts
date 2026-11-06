import { PortalId } from '@app/kernel';
import { NotLinkableError, UnsupportedLinkError } from './errors.js';
import { PortalLinks, type PortalLink } from './portal-links.js';

const portal = (id: string) => PortalId.parse(id);
const links = (entries: Record<string, PortalLink>) =>
  new PortalLinks(
    new Map(Object.entries(entries).map(([id, link]) => [portal(id), link])),
  );

const policy = links({
  canvas: { mode: 'token', adminsOnly: true },
  moodle: { mode: 'token', adminsOnly: false },
  teams: { mode: 'shared', adminsOnly: false },
});

describe('PortalLinks', () => {
  it('leaves every portal it names no other mode for shared', () => {
    expect(links({}).of(portal('canvas'))).toEqual({
      mode: 'shared',
      adminsOnly: false,
    });
    expect(policy.of(portal('teams')).mode).toBe('shared');
    expect(policy.of(portal('canvas')).mode).toBe('token');
  });

  it("opens the portals not shared to users, those for admins to admins' only", () => {
    expect(policy.openTo(true)).toEqual(['canvas', 'moodle']);
    expect(policy.openTo(false)).toEqual(['moodle']);
    expect(links({}).openTo(true)).toEqual([]);
  });

  it("lets a user link by the portal's own mode, and an admin only one for admins", () => {
    expect(() => policy.check(portal('moodle'), 'token', false)).not.toThrow();
    expect(() => policy.check(portal('canvas'), 'token', true)).not.toThrow();
    for (const [id, admin] of [
      ['canvas', false],
      ['teams', true],
      ['elsewhere', true],
    ] as const)
      expect(() => policy.check(portal(id), 'token', admin)).toThrow(
        new NotLinkableError(portal(id), 'token'),
      );
  });

  it("refuses at startup a mode the portal's connector doesn't take", () => {
    const asked: string[] = [];
    policy.checkAgainst((p, mode) => {
      asked.push(`${p}=${mode}`);
      return true;
    });
    // a shared portal needs nothing of its connector
    expect(asked).toEqual(['canvas=token', 'moodle=token']);

    expect(() => policy.checkAgainst((p) => p !== 'moodle')).toThrow(
      new UnsupportedLinkError(portal('moodle'), 'token'),
    );
  });
});
