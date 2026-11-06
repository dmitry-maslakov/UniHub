import { describe, expect, it } from 'vitest';
import { fileSize, webAddress } from './format';

describe('course formats', () => {
  it('say a size as a file manager does', () => {
    expect(fileSize(null)).toBeUndefined();
    expect(fileSize(512)).toBe('512 B');
    expect(fileSize(1_400_000)).toBe('1.4 MB');
  });

  it('link a post only to a web address', () => {
    expect(webAddress('https://lms.example/p/1')).toBe(
      'https://lms.example/p/1',
    );
    expect(webAddress('javascript:alert(1)')).toBeUndefined();
    expect(webAddress(null)).toBeUndefined();
  });
});
