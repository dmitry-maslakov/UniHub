import { lexer } from 'marked';

// What a reader gets at once is at most this long, an office document's
// section too.
export const MAX_PART = 10_000;
// marked takes seconds and most of the worker's heap for 16 MiB, so
// markdown past a million characters (1 MiB or so) goes by lines
export const MAX_MARKDOWN = 1024 * 1024;

// Whole lines, as many as fit in a part. The parts joined give the text back.
export function byLines(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  while (text.length - start > MAX_PART) {
    const end = start + cut(text.slice(start, start + MAX_PART));
    parts.push(text.slice(start, end));
    start = end;
  }
  parts.push(text.slice(start));
  return parts;
}

// How much of the next MAX_PART characters makes a part: up to a blank line
// in its second half, else its last line, else its last space, else (a
// minified file, base64) all of it but half of a surrogate pair.
function cut(window: string) {
  const blank = window.lastIndexOf('\n\n');
  if (blank >= MAX_PART / 2) return blank + 2;
  const line = window.lastIndexOf('\n');
  if (line >= 0) return line + 1;
  const space = window.lastIndexOf(' ');
  if (space >= 0) return space + 1;
  return /[\ud800-\udbff]$/.test(window) ? MAX_PART - 1 : MAX_PART;
}

// A part per section of markdown, a long one going on in the next. A section
// starts at a heading of the document itself: a # in a code block, a quote
// or a list starts none. The parts joined give the text back.
export function byHeading(markdown: string): string[] {
  if (markdown.length > MAX_MARKDOWN) return byLines(markdown);
  const sections: string[] = [];
  let start = 0;
  let at = 0;
  for (const { type, raw } of lexer(markdown)) {
    // blank lines before the first heading are no section of their own
    if (type === 'heading' && markdown.slice(start, at).trim()) {
      sections.push(markdown.slice(start, at));
      start = at;
    }
    at += raw.length;
  }
  sections.push(markdown.slice(start));
  return sections.flatMap((section) => byLines(section));
}
