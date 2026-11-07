import { describe, expect, it } from 'vitest';
import { isBanned } from './is-banned';

const now = new Date('2026-11-07T10:00:00Z');

describe('isBanned', () => {
  it.each([
    [{}, false],
    [{ banned: false, banExpires: '2027-01-01T00:00:00Z' }, false],
    [{ banned: true }, true],
    [{ banned: true, banExpires: null }, true],
    [{ banned: true, banExpires: '2026-12-01T00:00:00Z' }, true],
    [{ banned: true, banExpires: new Date('2026-12-01T00:00:00Z') }, true],
    [{ banned: true, banExpires: '2026-11-01T00:00:00Z' }, false],
  ])('%j is %s', (user, expected) => {
    expect(isBanned(user, now)).toBe(expected);
  });
});
