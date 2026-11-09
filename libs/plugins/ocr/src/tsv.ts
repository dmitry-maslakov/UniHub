// Tesseract's `tsv` output: a header, then a row per element, tab-separated:
// level page block paragraph line word left top width height conf text.
// Pure, so the filters can be checked without the binary.

export interface Word {
  block: number;
  paragraph: number;
  line: number;
  conf: number;
  text: string;
}

// words under this confidence are noise
export const MIN_CONFIDENCE = 40;
// text shorter than this counts as nothing
const MIN_TEXT = 3;

// rows with a confidence (-1 marks a block, a line) and a word in them
export function parseTsv(tsv: string): Word[] {
  const words: Word[] = [];
  for (const row of tsv.split('\n').slice(1)) {
    const [, , block, paragraph, line, , , , , , conf, ...text] = row
      .replace(/\r$/, '')
      .split('\t');
    const word = text.join('\t').trim();
    if (!word || !(Number(conf) >= 0)) continue;
    words.push({
      block: Number(block),
      paragraph: Number(paragraph),
      line: Number(line),
      conf: Number(conf),
      text: word,
    });
  }
  return words;
}

// the mean confidence of the words, each weighted by its length; 0 for none
export function meanConfidence(words: Word[]) {
  const length = words.reduce((sum, { text }) => sum + text.length, 0);
  return length === 0
    ? 0
    : words.reduce((sum, { conf, text }) => sum + conf * text.length, 0) /
        length;
}

// Words joined by a space within a line, lines by a newline, a new paragraph
// or block by a blank line. Words that are surely wrong, or no word at all
// (a stray mark), are left out.
export function textOf(words: Word[]) {
  let text = '';
  let last: Word | undefined;
  for (const word of words) {
    if (word.conf < MIN_CONFIDENCE || !/[\p{L}\p{N}]/u.test(word.text))
      continue;
    if (!last) text = word.text;
    else if (word.block !== last.block || word.paragraph !== last.paragraph)
      text += `\n\n${word.text}`;
    else if (word.line !== last.line) text += `\n${word.text}`;
    else text += ` ${word.text}`;
    last = word;
  }
  return text.trim().length < MIN_TEXT ? '' : text.trim();
}
