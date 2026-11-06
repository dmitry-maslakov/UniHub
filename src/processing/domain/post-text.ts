import { z } from 'zod';
import type { Json } from '@app/kernel';

// What catalog has of a post (an announcement, a page...) for its text
export interface Post {
  title: string | null;
  // whatever the portal gave, kept as is
  raw: Json;
}

// The rule's version, in what a post's record is made from: a new one has
// every post's text made again on the next reconcile, no new generation
export const POST_TEXT_VERSION = 1;

// past this a post is searched by its start only: a page that long is rare,
// and each chunk of it is embedded
export const MAX_POST_CHARS = 100_000;
// and of what's read for it: HTML takes more than the text it holds
export const MAX_POST_HTML = 1_000_000;

// the portal's own values rather than words: a link, a date
const link = z.httpUrl();
const timestamp = z.union([
  z.iso.datetime({ offset: true, local: true }),
  z.iso.date(),
]);
const isWords = (value: string) =>
  !link.safeParse(value).success && !timestamp.safeParse(value).success;

// every string in it, depth first, in its order
function* stringsOf(value: Json): Generator<string> {
  if (typeof value === 'string') yield value;
  else if (Array.isArray(value))
    for (const item of value) yield* stringsOf(item);
  else if (value && typeof value === 'object')
    for (const item of Object.values(value)) yield* stringsOf(item);
}

// What of a post is read for search, as HTML: its title, then every string
// the portal gave in raw, wherever it is (the body of a page, an
// announcement's message, an attachment's name), each once, up to
// MAX_POST_HTML characters in all. The hub knows no portal's fields, so it
// takes them all but links and dates.
export function postStrings({ title, raw }: Post) {
  const strings = new Set(
    [title ?? '', ...stringsOf(raw)]
      .map((value) => value.trim())
      .filter((value) => value && isWords(value)),
  );
  const kept: string[] = [];
  let left = MAX_POST_HTML;
  for (const value of strings) {
    if (left <= 0) break;
    kept.push(value.slice(0, left));
    left -= value.length;
  }
  return kept;
}

// A post's text from its strings as read, in their order: each text said
// once, up to MAX_POST_CHARS
export const postText = (read: readonly string[]) =>
  [...new Set(read.map((text) => text.trim()).filter(Boolean))]
    .join('\n\n')
    .slice(0, MAX_POST_CHARS);
