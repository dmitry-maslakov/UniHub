import { describe, expect, it } from 'vitest';
import { appKey } from './clients';
import { displayCode, normalizeCode } from './user-code';

describe('user codes', () => {
  it('are read however they were typed', () => {
    expect(normalizeCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(displayCode('ABCDEFGH')).toBe('ABCD-EFGH');
  });
});

describe('appKey', () => {
  it("names the hub's own apps, and any other client as an app", () => {
    expect(appKey('unihub-web')).toBe('web');
    expect(appKey('unihub-app')).toBe('native');
    expect(appKey('tv-client')).toBe('other');
    expect(appKey('constructor')).toBe('other');
    expect(appKey()).toBe('other');
  });
});
