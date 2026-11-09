import { describe, expect, it } from 'vitest';
import {
  contentUrl,
  opensInline,
  viewable,
  viewKind,
  viewUrl,
} from './content-url';

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

describe('viewUrl', () => {
  it('names the page and the member only when given', () => {
    expect(viewUrl('f1')).toBe('/api/files/f1/view');
    expect(viewUrl('f1', { page: 3 })).toBe('/api/files/f1/view?page=3');
    expect(viewUrl('f1', { page: 2, member: 'fig 1/a&b.png' })).toBe(
      '/api/files/f1/view?page=2&member=fig%201%2Fa%26b.png',
    );
  });
});

describe('viewable', () => {
  it('tells an image from a PDF', () => {
    expect(viewKind('image/webp', 'x')).toBe('image');
    expect(viewKind(null, 'a.png')).toBe('image');
    expect(viewKind(null, 'a.PDF')).toBe('pdf');
    expect(viewKind('text/plain', 'a.txt')).toBeNull();
  });

  it('takes images and PDFs, by type or by extension, never SVG', () => {
    expect(viewable('image/png', 'x')).toBe(true);
    expect(viewable('application/pdf; charset=binary', 'x')).toBe(true);
    expect(viewable(null, 'scan.JPEG')).toBe(true);
    expect(viewable('application/octet-stream', 'a.webp')).toBe(true);
    expect(viewable('image/svg+xml', 'logo.png')).toBe(false);
    expect(viewable(null, 'logo.svg')).toBe(false);
    expect(viewable('text/plain', 'a.txt')).toBe(false);
    expect(viewable(null, 'png')).toBe(false);
  });
});
