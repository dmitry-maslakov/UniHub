import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('keeps a path on this site, with its query', () => {
    expect(safeNext('/device?user_code=ABCD')).toBe('/device?user_code=ABCD');
  });

  it('refuses anything that leaves it', () => {
    for (const next of [
      '//evil.test',
      '/\\evil.test',
      '/\t/evil.test',
      '/\n/evil.test',
      '/\r/evil.test',
      '/\u0000/evil.test',
      '/\u007f/evil.test',
      'https://evil.test',
      'device',
      '',
      undefined,
      ['/'],
    ])
      expect(safeNext(next)).toBe('/');
  });
});
