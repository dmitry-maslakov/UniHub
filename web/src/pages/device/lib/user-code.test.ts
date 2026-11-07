import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { appName, displayCode, normalizeCode } from './user-code';

describe('user codes', () => {
  it('are read however they were typed', () => {
    expect(normalizeCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(displayCode('ABCDEFGH')).toBe('ABCD-EFGH');
  });
});

describe('appName', () => {
  it("names the hub's own apps, and shows another by its client id", () => {
    const t = i18n.getFixedT('en', 'device');
    expect(appName(t, 'unihub-web')).toBe('UniHub in a browser');
    expect(appName(t, 'unihub-app')).toBe('The UniHub app');
    expect(appName(t, 'tv-client')).toBe('tv-client');
    expect(appName(t, 'constructor')).toBe('constructor');
    expect(appName(t)).toBe('An app');
  });
});
