import { describe, expect, it } from 'vitest';
import { hostOf, isSitePortal, siteOf, tokenPageOf } from './site';

describe("a school's site", () => {
  it('is the origin of any https address of it, the scheme left out too', () => {
    for (const typed of [
      'https://canvas.example.edu',
      ' Canvas.Example.edu/courses/1 ',
      'https://canvas.example.edu:443/login',
    ])
      expect(siteOf(typed)).toBe('https://canvas.example.edu');
  });

  it("is none for what the hub wouldn't take", () => {
    for (const typed of [
      '',
      'http://canvas.example.edu',
      'https://canvas.example.edu:8443',
      'https://me@canvas.example.edu',
      'https://10.0.0.1',
      'https://localhost',
      'not an address',
    ])
      expect(siteOf(typed), typed).toBeNull();
  });

  it("gives the page tokens are made on, and the site's name", () => {
    expect(tokenPageOf('https://canvas.example.edu')).toBe(
      'https://canvas.example.edu/profile/settings',
    );
    expect(hostOf('https://canvas.example.edu')).toBe('canvas.example.edu');
    expect(isSitePortal('canvas')).toBe(true);
    expect(isSitePortal('moodle')).toBe(false);
  });
});
