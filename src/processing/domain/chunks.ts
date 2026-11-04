// A text as the search index keeps it: a document per chunk, short enough to
// embed and to show as a snippet, within a page so a hit names its page.
export const CHUNK_CHARS = 1200;

export interface TextChunk {
  // from 1, as GetTextPageQuery counts pages
  page: number;
  // from 0 within its page
  chunk: number;
  text: string;
}

// the index marks highlights with these, so they mustn't be in the text
const MARKERS = /[\uE000\uE001]/g;
// where a chunk may end, the first one found in its second half winning
const BREAKS = [/\n\n/g, /\n/g, /\s/g];
const HIGH_SURROGATE = /[\uD800-\uDBFF]/;

// Each part (page from 1) cut into chunks of at most CHUNK_CHARS UTF-16
// units, numbered from 0, without overlap. NFC, as the analyzers fold
// precomposed letters only and snippets count in this text.
export const chunksOf = (parts: readonly string[]): TextChunk[] =>
  parts.flatMap((part, i) =>
    pieces(part.replace(MARKERS, '\uFFFD').normalize('NFC')).map(
      (text, chunk) => ({
        page: i + 1,
        chunk,
        text,
      }),
    ),
  );

function pieces(text: string) {
  const out: string[] = [];
  for (let rest = text.trim(); rest;) {
    const end = rest.length <= CHUNK_CHARS ? rest.length : endOf(rest);
    out.push(rest.slice(0, end).trimEnd());
    rest = rest.slice(end).trimStart();
  }
  return out;
}

// at the last paragraph, line or word break past half the window, else at
// its end, but never between the halves of a surrogate pair
function endOf(text: string) {
  const window = text.slice(0, CHUNK_CHARS + 1);
  for (const at of BREAKS) {
    const last = [...window.matchAll(at)].at(-1)?.index ?? 0;
    if (last > CHUNK_CHARS / 2) return last;
  }
  return HIGH_SURROGATE.test(text[CHUNK_CHARS - 1])
    ? CHUNK_CHARS - 1
    : CHUNK_CHARS;
}
