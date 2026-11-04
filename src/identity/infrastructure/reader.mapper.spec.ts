import { ADMIN_ROLE } from '../domain/reader.js';
import { toReader } from './reader.mapper.js';

const row = { role: null, banned: null, banExpires: null };

describe("a user's row", () => {
  it('names their roles, the comma separated list Better Auth keeps', () => {
    expect(toReader(row).roles).toEqual([]);
    expect(toReader({ ...row, role: `user, ${ADMIN_ROLE},` }).roles).toEqual([
      'user',
      ADMIN_ROLE,
    ]);
  });

  it('bans them until banExpires, for good without it', () => {
    const until = new Date('2026-11-05T00:00:00Z');
    expect(toReader({ ...row, banned: true, banExpires: until }).ban).toEqual({
      until,
    });
    expect(toReader({ ...row, banned: true }).ban?.until).toBeNull();
    // an expiry left behind by a ban lifted since
    expect(toReader({ ...row, banned: false, banExpires: until }).ban).toBe(
      null,
    );
  });
});
