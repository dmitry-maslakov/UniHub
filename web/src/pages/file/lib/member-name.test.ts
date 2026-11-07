import { describe, expect, it } from 'vitest';
import { memberName } from './member-name';

describe('memberName', () => {
  it('names a member without its folders', () => {
    expect(memberName('lab/src/main.c')).toBe('main.c');
    expect(memberName('main.c')).toBe('main.c');
    expect(memberName('lab/')).toBe('lab/');
  });
});
