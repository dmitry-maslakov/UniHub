import { PortalId } from '@app/kernel';
import type { ReadScope } from '../../identity/contracts.js';
import { readNothing, viewersOf } from './viewers.js';

const [moodle, catalog] = ['moodle', 'catalog'].map((id) => PortalId.parse(id));
const viewing = {
  portals: [moodle],
  accounts: ['ana-moodle'],
  picks: { portals: [catalog], courses: ['os-picked'], into: new Map() },
  hidden: ['pc-old'],
};
const scope = (granted: string[] | null, ownAccounts = true) =>
  ({ granted, ownAccounts }) as ReadScope;

describe('viewersOf', () => {
  it('reads the shared account in the courses granted, the public portals whole, and the own accounts whole', () => {
    expect(viewersOf(scope(['os']), viewing)).toEqual({
      accounts: ['ana-moodle'],
      shared: { courses: ['os'], except: [moodle, catalog] },
      open: [catalog],
    });
  });

  it("reads every course through the shared account for an admin, the admin's own accounts alone in the others", () => {
    expect(viewersOf(scope(null), viewing)).toEqual({
      accounts: ['ana-moodle'],
      shared: { courses: null, except: [moodle, catalog] },
      open: [catalog],
    });
  });

  it('reads nothing for a ban, not even through their own accounts or of a public portal', () => {
    const banned = viewersOf(scope([], false), viewing);
    expect(banned).toEqual({
      accounts: [],
      shared: { courses: [], except: [moodle, catalog] },
      open: [],
    });
    expect(readNothing(banned)).toBe(true);
  });

  it('has something to read with a public portal alone', () => {
    const anyone = viewersOf(scope([]), { ...viewing, accounts: [] });
    expect(readNothing(anyone)).toBe(false);
  });
});
