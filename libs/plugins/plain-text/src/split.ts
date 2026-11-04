import { Lexer, type Token } from 'marked';

// marked takes seconds for a megabyte of lists nested in each other, and
// minutes for more, so markdown past a million characters (1 MiB or so) goes
// by lines
export const MAX_MARKDOWN = 1024 * 1024;

// Whole lines, as many as fit in max characters. The parts joined give the
// text back.
export function byLines(text: string, max: number): string[] {
  const parts: string[] = [];
  let start = 0;
  while (text.length - start > max) {
    const end = start + cut(text.slice(start, start + max));
    parts.push(text.slice(start, end));
    start = end;
  }
  parts.push(text.slice(start));
  return parts;
}

// How much of a window of text makes a part: up to a blank line in its
// second half, else its last line, else its last space, else (a minified
// file, base64) all of it but half of a surrogate pair.
function cut(window: string) {
  const blank = window.lastIndexOf('\n\n');
  if (blank >= window.length / 2) return blank + 2;
  const line = window.lastIndexOf('\n');
  if (line >= 0) return line + 1;
  const space = window.lastIndexOf(' ');
  if (space >= 0) return space + 1;
  return /[\ud800-\udbff]$/.test(window) ? window.length - 1 : window.length;
}

// A part per section of markdown, a long one going on in the next. A section
// starts at a heading of the document itself: a # in a code block, a quote
// or a list starts none. The parts joined give the text back.
export function byHeading(markdown: string, max: number): string[] {
  if (markdown.length > MAX_MARKDOWN) return byLines(markdown, max);
  // only the blocks: their inline markup takes marked minutes for a
  // paragraph full of * or _ (code pasted without a fence)
  let blocks: Token[];
  try {
    blocks = new Lexer().blockTokens(markdown);
  } catch {
    // quotes nested past the stack (thousands of >)
    return byLines(markdown, max);
  }
  const sections: string[] = [];
  let start = 0;
  let at = 0;
  for (const { type, raw } of blocks) {
    // blank lines before the first heading are no section of their own
    if (type === 'heading' && markdown.slice(start, at).trim()) {
      sections.push(markdown.slice(start, at));
      start = at;
    }
    at += raw.length;
  }
  sections.push(markdown.slice(start));
  return sections.flatMap((section) => byLines(section, max));
}
