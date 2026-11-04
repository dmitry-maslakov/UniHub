import { Ban } from './ban.js';
import { ADMIN_ROLE, Reader } from './reader.js';

const now = new Date('2026-11-04T12:00:00Z');
const tomorrow = new Date('2026-11-05T12:00:00Z');
const yesterday = new Date('2026-11-03T12:00:00Z');

const reads = (reader: Reader, courseId: string, at = now) =>
  reader.scope(['granted'], at).allows(courseId);

describe('Reader', () => {
  it('reads the courses granted to them', () => {
    const student = new Reader(['user'], null);
    expect(reads(student, 'granted')).toBe(true);
    expect(reads(student, 'other')).toBe(false);
  });

  it('reads every course as an admin, among other roles too', () => {
    const admin = new Reader(['user', ADMIN_ROLE], null);
    expect(reads(admin, 'other')).toBe(true);
  });

  it('reads nothing while banned, admin or not', () => {
    for (const roles of [['user'], [ADMIN_ROLE]]) {
      const banned = new Reader(roles, new Ban(tomorrow));
      expect(banned.bannedAt(now)).toBe(true);
      expect(reads(banned, 'granted')).toBe(false);
      expect(reads(banned, 'other')).toBe(false);
      expect(reads(banned, 'granted', tomorrow)).toBe(true);
    }
    expect(reads(new Reader([ADMIN_ROLE], new Ban(null)), 'other')).toBe(false);
  });

  it('reads again once a ban is over', () => {
    const was = new Reader(['user'], new Ban(yesterday));
    expect(was.bannedAt(now)).toBe(false);
    expect(reads(was, 'granted')).toBe(true);
  });
});
