import { opensInline } from './inline.js';

describe('opensInline', () => {
  it('opens PDFs, pictures and plain text in the browser, and nothing else', () => {
    for (const mime of [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'text/plain',
      // a media type is compared by its essence
      'TEXT/PLAIN; charset=utf-8',
    ])
      expect(opensInline(mime), mime).toBe(true);
    // pages that run, pictures that can hold scripts, files an app opens
    for (const mime of [
      'text/html',
      'image/svg+xml',
      'application/xhtml+xml',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'application/octet-stream',
      '',
      null,
    ])
      expect(opensInline(mime), String(mime)).toBe(false);
  });
});
