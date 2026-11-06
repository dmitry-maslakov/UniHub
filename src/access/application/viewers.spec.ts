import { PortalId } from '@app/kernel';
import type { ReadScope } from '../../identity/contracts.js';
import { viewersOf } from './viewers.js';

const moodle = PortalId.parse('moodle');
const viewing = { portals: [moodle], accounts: ['ana-moodle'] };
const scope = (granted: string[] | null, ownAccounts = true) =>
  ({ granted, ownAccounts }) as ReadScope;

describe('viewersOf', () => {
  it('reads the shared account in the courses granted, and the own accounts whole', () => {
    expect(viewersOf(scope(['os']), viewing)).toEqual({
      accounts: ['ana-moodle'],
      shared: { courses: ['os'], except: [moodle] },
    });
  });

  it("reads every course through the shared account for an admin, the admin's own accounts alone in the others", () => {
    expect(viewersOf(scope(null), viewing)).toEqual({
      accounts: ['ana-moodle'],
      shared: { courses: null, except: [moodle] },
    });
  });

  it('reads nothing for a ban, not even through their own accounts', () => {
    expect(viewersOf(scope([], false), viewing)).toEqual({
      accounts: [],
      shared: { courses: [], except: [moodle] },
    });
  });
});
