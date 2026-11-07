import { describe, expect, it } from 'vitest';
import { webAddress } from './web-address';

describe('webAddress', () => {
  it('links only to a web address', () => {
    expect(webAddress('https://lms.example/p/1')).toBe(
      'https://lms.example/p/1',
    );
    expect(webAddress('HTTP://lms.example/p/1')).toBe('HTTP://lms.example/p/1');
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'mailto:teacher@example.edu',
      '//lms.example/p/1',
      null,
    ])
      expect(webAddress(url)).toBeUndefined();
  });
});
