import { FRESH_AGE_SECONDS, isFresh } from './fresh-session.js';

const now = new Date('2026-11-06T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const day = FRESH_AGE_SECONDS * 1000;

describe('a fresh session', () => {
  it('was signed in within the last day, and not a moment before', () => {
    expect(day).toBe(24 * 60 * 60 * 1000);
    expect(isFresh(ago(0), now)).toBe(true);
    expect(isFresh(ago(day - 1), now)).toBe(true);
    expect(isFresh(ago(day), now)).toBe(false);
    expect(isFresh(ago(2 * day), now)).toBe(false);
  });
});
