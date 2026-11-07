import { describe, expect, it } from 'vitest';
import { isNew } from './is-new';

describe('isNew', () => {
  const now = new Date('2026-11-07T12:00:00Z');

  it('counts what its portal changed in the last 14 days, and a date ahead of now', () => {
    expect(isNew({ changedAt: '2026-10-24T12:00:00.000Z' }, now)).toBe(true);
    expect(isNew({ changedAt: '2026-10-24T11:59:59.000Z' }, now)).toBe(false);
    expect(isNew({ changedAt: '2026-11-08T09:00:00.000Z' }, now)).toBe(true);
  });

  it('never counts a file without a date', () => {
    expect(isNew({ changedAt: null }, now)).toBe(false);
  });
});
