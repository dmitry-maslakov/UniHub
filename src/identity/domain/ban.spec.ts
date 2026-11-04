import { Ban } from './ban.js';

const now = new Date('2026-11-04T12:00:00Z');

describe('Ban', () => {
  it('holds until its time, then not', () => {
    const ban = new Ban(new Date('2026-11-05T00:00:00Z'));
    expect(ban.activeAt(now)).toBe(true);
    expect(ban.activeAt(new Date('2026-11-05T00:00:00Z'))).toBe(false);
  });

  it('holds for good without one', () => {
    expect(new Ban(null).activeAt(new Date('2999-01-01'))).toBe(true);
  });
});
