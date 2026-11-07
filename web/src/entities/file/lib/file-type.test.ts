import { describe, expect, it } from 'vitest';
import { fileType } from './file-type';

describe('fileType', () => {
  it("tells a file's type by its media type", () => {
    const cases: [string, ReturnType<typeof fileType>][] = [
      ['application/pdf', 'pdf'],
      [
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'slides',
      ],
      ['application/vnd.ms-powerpoint', 'slides'],
      ['application/vnd.oasis.opendocument.presentation', 'slides'],
      [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'document',
      ],
      ['application/msword', 'document'],
      ['application/vnd.oasis.opendocument.text', 'document'],
      ['application/rtf', 'document'],
      [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'spreadsheet',
      ],
      ['text/csv', 'spreadsheet'],
      ['application/zip', 'archive'],
      ['application/x-7z-compressed', 'archive'],
      ['application/vnd.rar', 'archive'],
      ['image/png', 'image'],
      ['text/plain; charset=utf-8', 'text'],
      ['TEXT/MARKDOWN', 'text'],
    ];
    for (const [mime, type] of cases)
      expect(fileType(mime, 'x'), mime).toBe(type);
  });

  it("falls back to the name's extension", () => {
    const cases: [string, ReturnType<typeof fileType>][] = [
      ['a.PDF', 'pdf'],
      ['deck.pptx', 'slides'],
      ['deck.key', 'slides'],
      ['notes.docx', 'document'],
      ['sheet.xlsx', 'spreadsheet'],
      ['lab.tgz', 'archive'],
      ['main.c', 'code'],
      ['boot.s', 'code'],
      ['readme.md', 'text'],
      ['a.b.txt', 'text'],
    ];
    for (const [name, type] of cases) {
      expect(fileType(null, name), name).toBe(type);
      // a media type that says nothing leaves it to the name
      expect(fileType('application/octet-stream', name), name).toBe(type);
    }
  });

  it('calls anything else a file', () => {
    expect(fileType(null, 'README')).toBe('other');
    expect(fileType(null, '.pdf')).toBe('other');
    expect(fileType('application/octet-stream', 'data.bin')).toBe('other');
    expect(fileType('application/x-unknown', 'x')).toBe('other');
  });
});
