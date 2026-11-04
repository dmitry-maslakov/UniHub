import type { Snippet } from '../../application/ports.js';

// the highlight's tags (keywordBody): characters for private use, which
// chunksOf takes out of the text, so they can only be OpenSearch's
export const OPEN = '\uE000';
export const CLOSE = '\uE001';
const TAG = /([\uE000\uE001])/;

// A highlighted fragment as text and the offsets of what's marked in it.
// OpenSearch merges matches that overlap, not ones that touch (an
// identifier matched in parts), which are joined here.
export function snippetOf(fragment: string): Snippet {
  const highlights: [number, number][] = [];
  let text = '';
  let start = 0;
  for (const part of fragment.split(TAG)) {
    if (part === OPEN) start = text.length;
    else if (part !== CLOSE) text += part;
    else {
      const last = highlights.at(-1);
      if (last?.[1] === start) last[1] = text.length;
      else highlights.push([start, text.length]);
    }
  }
  return { text, highlights };
}
