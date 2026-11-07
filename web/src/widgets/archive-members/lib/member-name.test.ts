import { describe, expect, it } from 'vitest';
import { memberFolder, memberName } from './member-name';

describe('memberName', () => {
  it('names a member without its folders', () => {
    expect(memberName('lab/src/main.c')).toBe('main.c');
    expect(memberName('main.c')).toBe('main.c');
    expect(memberName('lab/')).toBe('lab/');
  });
});

describe('memberFolder', () => {
  it('is the folders of a member, none at the top', () => {
    expect(memberFolder('lab/src/main.c')).toBe('lab/src');
    expect(memberFolder('main.c')).toBe('');
  });
});
