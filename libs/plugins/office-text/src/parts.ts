import type { OfficeChunk } from 'officeparser';

export type SplitBy = 'page' | 'slide' | 'heading';

// past this many characters a section goes on in the next part, so one
// without headings (a whole document, at times) isn't read in one go
export const MAX_SECTION = 10_000;

type Chunk = Pick<OfficeChunk, 'text' | 'metadata'>;

// a document as parse.worker.ts makes it: officeparser's chunks, and how
// many pages or slides it has
export interface Parsed {
  chunks: readonly Chunk[];
  units: number;
}

// officeparser's chunks as parts. Part n of a pdf or a deck is page or slide
// n, empty where it has no text, so the numbers a reader is told match the
// document's. Sections follow each other, a long one cut where a chunk ends.
export const toParts = ({ chunks, units }: Parsed, by: SplitBy) =>
  by === 'heading' ? sections(chunks) : numbered(chunks, units);

function numbered(chunks: readonly Chunk[], units: number) {
  const parts: string[] = [];
  for (const { text, metadata } of chunks) {
    // a chunk without a number goes with the one before it
    const n =
      metadata.pageNumber ?? metadata.slideNumber ?? Math.max(parts.length, 1);
    parts[n - 1] =
      parts[n - 1] === undefined ? text : `${parts[n - 1]}\n${text}`;
  }
  // a page without text is a hole in the array, or past its end
  return Array.from(
    { length: Math.max(units, parts.length) },
    (_, i) => parts[i] ?? '',
  );
}

function sections(chunks: readonly Chunk[]) {
  const parts: string[] = [];
  let heading: string | undefined;
  for (const { text, metadata } of chunks) {
    const last = parts.length - 1;
    const fits =
      last >= 0 &&
      metadata.closestHeading === heading &&
      parts[last].length + text.length < MAX_SECTION;
    if (fits) parts[last] += `\n${text}`;
    else parts.push(text);
    heading = metadata.closestHeading;
  }
  return parts;
}
