import { describe, expect, it } from 'vitest';
import { FIRST_SYNC_POLL_MS, firstSyncOf, whileFirstSync } from './first-sync';

const canvas = { label: 'Canvas', firstSync: false };
const catalog = { label: 'Course catalog', firstSync: false };

describe('a first read', () => {
  it('names the source being read for the first time', () => {
    expect(firstSyncOf([catalog, { ...canvas, firstSync: true }])).toEqual({
      label: 'Canvas',
      firstSync: true,
    });
    expect(firstSyncOf([catalog, canvas])).toBeUndefined();
    expect(firstSyncOf(undefined)).toBeUndefined();
  });

  it('asks again every 30 s while one goes on, then stops', () => {
    expect(whileFirstSync([{ ...canvas, firstSync: true }])).toBe(
      FIRST_SYNC_POLL_MS,
    );
    expect(FIRST_SYNC_POLL_MS).toBe(30_000);
    expect(whileFirstSync([canvas])).toBe(false);
    expect(whileFirstSync(undefined)).toBe(false);
  });
});
