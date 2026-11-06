import { describe, expect, it } from 'vitest';
import { displayCode, normalizeCode } from './user-code';

describe('user codes', () => {
  it('are read however they were typed', () => {
    expect(normalizeCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(displayCode('ABCDEFGH')).toBe('ABCD-EFGH');
  });
});
