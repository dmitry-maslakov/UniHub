import { describe, expect, it } from 'vitest';
import { contentUrl, opensInline } from './content-url';

describe('contentUrl', () => {
  it('asks for a file inline only when told', () => {
    expect(contentUrl('f1')).toBe('/api/files/f1/content');
    expect(contentUrl('f1', { inline: false })).toBe('/api/files/f1/content');
    expect(contentUrl('f1', { inline: true })).toBe(
      '/api/files/f1/content?disposition=inline',
    );
  });

  it("encodes a member's path", () => {
    expect(contentUrl('f1', { member: 'lab/main.c' })).toBe(
      '/api/files/f1/content?member=lab%2Fmain.c',
    );
    expect(contentUrl('f1', { member: 'lab 1/a&b.c', inline: true })).toBe(
      '/api/files/f1/content?member=lab%201%2Fa%26b.c&disposition=inline',
    );
  });
});

describe('opensInline', () => {
  it('opens in the browser what the hub serves inline, nothing else', () => {
    for (const mime of [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'text/plain',
      'TEXT/PLAIN; charset=utf-8',
    ])
      expect(opensInline(mime), mime).toBe(true);
    for (const mime of ['text/html', 'image/svg+xml', 'application/zip', null])
      expect(opensInline(mime), String(mime)).toBe(false);
  });
});
