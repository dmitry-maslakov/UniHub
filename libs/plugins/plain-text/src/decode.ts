import { isAscii, isUtf8 } from 'node:buffer';
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
// drops a BOM
const utf8 = new TextDecoder();

// A file's text, or null for binary content: its encoding found by the BOM,
// by being valid UTF-8, or by jschardet.
export function decode(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return iconv.decode(bytes, 'utf-16le');
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return iconv.decode(bytes, 'utf-16be');
  // a NUL early on is UTF-16 or binary
  if (bytes.subarray(0, 8192).includes(0)) {
    const { encoding } = detect(bytes, { detectEncodings: ENCODINGS });
    return encoding === null ? null : iconv.decode(bytes, encoding);
  }
  // ASCII too
  if (isUtf8(bytes)) return utf8.decode(bytes);
  return byLine(bytes);
}

// A file in a code page, or pasted together from one and UTF-8 (files put
// together, a merge): lines valid as UTF-8 are read so, the others in the
// code page jschardet finds in them. A run of lines alike is read at once,
// an ASCII line going with the run it's in.
function byLine(bytes: Uint8Array) {
  const encoding = codePage(bytes);
  if (encoding === null) return null;
  const read = (run: Uint8Array, valid: boolean) =>
    valid ? utf8.decode(run) : iconv.decode(run, encoding);
  let text = '';
  let from = 0;
  let valid = true;
  for (const [start, end] of lines(bytes)) {
    const line = bytes.subarray(start, end);
    if (isAscii(line) || isUtf8(line) === valid) continue;
    text += read(bytes.subarray(from, start), valid);
    from = start;
    valid = !valid;
  }
  return text + read(bytes.subarray(from), valid);
}

// The code page jschardet finds in the lines not valid as UTF-8, as many as
// fit in SAMPLE_BYTES. Given a whole file, it reads its start only, and
// guesses wrong for a large one whose few letters with diacritics come later.
function codePage(bytes: Uint8Array) {
  const sample: Uint8Array[] = [];
  let size = 0;
  for (const [start, end] of lines(bytes)) {
    if (size >= SAMPLE_BYTES) break;
    const line = bytes.subarray(start, end);
    if (isUtf8(line)) continue;
    sample.push(line);
    size += line.length;
  }
  const { encoding } = detect(Buffer.concat(sample).subarray(0, SAMPLE_BYTES), {
    detectEncodings: ENCODINGS,
  });
  return encoding;
}

// where each line of a file starts and ends, its \n in it
function* lines(bytes: Uint8Array) {
  for (let start = 0, end = 0; start < bytes.length; start = end) {
    end = bytes.indexOf(0x0a, start) + 1 || bytes.length;
    yield [start, end] as const;
  }
}
