import type { Snippet } from '../../application/queries.js';
import { HIGHLIGHT } from '../../domain/chunks.js';

const { open, close } = HIGHLIGHT;
const TAG = new RegExp(`([${open}${close}])`);

// A highlighted fragment as text and the offsets of what's marked in it.
// OpenSearch merges matches that overlap, not ones that touch (an
// identifier matched in parts), which are joined here.
export function snippetOf(fragment: string): Snippet {
  const highlights: [number, number][] = [];
  let text = '';
  let start = 0;
  for (const part of fragment.split(TAG)) {
    if (part === open) start = text.length;
    else if (part !== close) text += part;
    else {
      const last = highlights.at(-1);
      if (last?.[1] === start) last[1] = text.length;
      else highlights.push([start, text.length]);
    }
  }
  return { text, highlights };
}
