import { isUtf8 } from 'node:buffer';
import iconv from 'iconv-lite';
import { detect } from 'jschardet';

// What text files come in besides UTF-8: Serbian Latin and Cyrillic in the
// Windows, ISO and DOS code pages (old C code), UTF-16. Without a list
// jschardet takes rarer ones (MacLatin2, KZ-1048); windows-1252 is left out,
// windows-1250 has the same letters but for a few.
const ENCODINGS = [
  'utf-8',
  'utf-16-le',
  'utf-16-be',
  'windows-1250',
  'windows-1251',
  'iso-8859-2',
  'iso-8859-5',
  'cp852',
  'cp855',
];
// how much of a file shows its code page to jschardet
const SAMPLE_BYTES = 64 * 1024;

// A file's text, or null for binary content: its encoding found by the BOM,
// by being valid UTF-8, or by jschardet.
export function decode(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return iconv.decode(bytes, 'utf-16le');
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return iconv.decode(bytes, 'utf-16be');
  // a NUL early on is UTF-16 or binary
  const nul = bytes.subarray(0, 8192).includes(0);
  // ASCII too; TextDecoder drops a BOM
  if (!nul && isUtf8(bytes)) return new TextDecoder().decode(bytes);
  const { encoding } = detect(nul ? bytes : highLines(bytes), {
    detectEncodings: ENCODINGS,
  });
  return encoding === null ? null : iconv.decode(bytes, encoding);
}

// The lines with a byte past ASCII, where an 8-bit code page shows. Given a
// whole file, jschardet reads its start only, and guesses wrong for a large
// one whose few letters with diacritics come later.
function highLines(bytes: Uint8Array) {
  const lines =
    Buffer.from(bytes)
      .toString('latin1')
      .match(/^.*[\x80-\xff].*$/gm) ?? [];
  return Buffer.from(lines.join('\n'), 'latin1').subarray(0, SAMPLE_BYTES);
}
