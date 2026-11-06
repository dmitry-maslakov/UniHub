import { z } from 'zod';
import type { Json } from '@app/kernel';

// What catalog has of a post (an announcement, a page...)
export interface Post {
  title: string | null;
  // whatever the portal gave, kept as is
  raw: Json;
}

// past this a post is searched by its start only: a page that long is rare,
// and each chunk of it is embedded
export const MAX_POST_CHARS = 100_000;

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

// A string as HTML, read as office-text reads an .html file: by
// officeparser, its tags, scripts and styles left out and its entities
// decoded; plain text comes out as it was. One officeparser can't read
// (nested past its limit) is left out. Loaded when first needed, by the
// worker: an api process indexes nothing.
async function textOf(html: string) {
  const { OfficeParser } = await import('officeparser');
  try {
    const ast = await OfficeParser.parseOffice(Buffer.from(html), {
      fileType: 'html',
    });
    return (await ast.to('text')).value.trim();
  } catch {
    return '';
  }
}

// What a post says, for search: its title, then every string the portal
// gave in raw, wherever it is (the body of a page, an announcement's
// message, an attachment's name), each read as HTML and said once. The
// hub knows no portal's fields, so it takes them all but links and dates.
export async function postText({ title, raw }: Post) {
  const strings = new Set(
    [title ?? '', ...stringsOf(raw)]
      .map((value) => value.trim())
      .filter((value) => value && isWords(value)),
  );
  const texts = new Set<string>();
  for (const value of strings) texts.add(await textOf(value));
  texts.delete('');
  return [...texts].join('\n\n').slice(0, MAX_POST_CHARS);
}
