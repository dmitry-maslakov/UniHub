import { decode } from './decode.ts';
import { notebookMarkdown } from './notebook.ts';
import { byHeading, byLines } from './split.ts';

// how a file's text is split: markdown and notebooks by heading
export type Kind = 'markdown' | 'notebook' | 'lines';

// The parts of a text file, none of binary content or of blank text, each
// up to max characters. Line ends are LF and letters composed (NFC), so a
// word is the same text whichever editor wrote it.
export function toParts(bytes: Uint8Array, kind: Kind, max: number): string[] {
  const decoded = decode(bytes);
  if (decoded === null) return [];
  // a notebook that isn't one is read as the text it is
  const notebook = kind === 'notebook' ? notebookMarkdown(decoded) : null;
  const text = (notebook ?? decoded).replace(/\r\n?/g, '\n').normalize('NFC');
  if (!text.trim()) return [];
  return notebook !== null || kind === 'markdown'
    ? byHeading(text, max)
    : byLines(text, max);
}
