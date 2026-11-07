import { describe, expect, it } from 'vitest';
import { fileSize } from './format';

describe('course formats', () => {
  it('say a size as a file manager does', () => {
    expect(fileSize(null)).toBeUndefined();
    expect(fileSize(512)).toBe('512 B');
    expect(fileSize(1_400_000)).toBe('1.4 MB');
  });
});
