import { PortalId } from '@app/kernel';
import {
  NotLinkableError,
  NotPickableError,
  UnsupportedLinkError,
} from './errors.js';
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
  catalog: { mode: 'public', adminsOnly: false },
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
    expect(policy.openTo(true)).toEqual(['canvas', 'catalog', 'moodle']);
    expect(policy.openTo(false)).toEqual(['catalog', 'moodle']);
    expect(links({}).openTo(true)).toEqual([]);
  });

  it("reads with users' own accounts the portals linked by token, for admins or not", () => {
    expect(policy.readWithAccounts()).toEqual(['canvas', 'moodle']);
    expect(links({}).readWithAccounts()).toEqual([]);
  });

  it('reads the public portals by picks, and lets courses be picked of those alone', () => {
    expect(policy.readByPicks()).toEqual(['catalog']);
    expect(links({}).readByPicks()).toEqual([]);
    expect(() => policy.checkPicking(portal('catalog'))).not.toThrow();
    for (const id of ['canvas', 'teams', 'elsewhere'])
      expect(() => policy.checkPicking(portal(id))).toThrow(
        new NotPickableError(portal(id)),
      );
  });

  it('names a portal as PORTAL_LABELS does, else by its id', () => {
    const named = new PortalLinks(
      new Map(),
      new Map([[portal('catalog'), 'Course catalog']]),
    );
    expect(named.label(portal('catalog'))).toBe('Course catalog');
    expect(named.label(portal('canvas'))).toBe('canvas');
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
    expect(asked).toEqual(['canvas=token', 'moodle=token', 'catalog=public']);

    expect(() => policy.checkAgainst((p) => p !== 'moodle')).toThrow(
      new UnsupportedLinkError(portal('moodle'), 'token'),
    );
    expect(() => policy.checkAgainst((p) => p !== 'catalog')).toThrow(
      new UnsupportedLinkError(portal('catalog'), 'public'),
    );
  });
});
