export interface Part {
  text: string;
  match: boolean;
}

// A snippet cut where the words matched: [start, end) offsets into its text,
// out of order or overlapping as the index may give them
export function highlight(
  text: string,
  ranges: readonly (readonly number[])[],
): Part[] {
  const parts: Part[] = [];
  let at = 0;
  for (const [start = 0, end = 0] of ranges.toSorted((a, b) => a[0]! - b[0]!)) {
    const from = Math.max(start, at);
    const to = Math.min(end, text.length);
    if (to <= from) continue;
    if (from > at) parts.push({ text: text.slice(at, from), match: false });
    parts.push({ text: text.slice(from, to), match: true });
    at = to;
  }
  if (at < text.length) parts.push({ text: text.slice(at), match: false });
  return parts;
}
