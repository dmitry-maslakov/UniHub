import type { ContentHash, PluginName } from '@app/kernel';

// What a reader reads of a content, by processor: the content's own text,
// then its entries' in turn when it's an archive, an archive in it with its
// entries in its place, each entry's pages headed by its path. A content
// that's no archive reads as its own text.

// a content whose text goes into another's: the content itself (no path), or
// an entry by its path from the outermost archive ('/' after an archive's)
export interface Member {
  path: string | null;
  hash: ContentHash;
}

// a processor's newest text of a content, as stored
export interface StoredText {
  hash: ContentHash;
  processor: PluginName;
  version: number;
  pages: number;
}

export interface Part {
  member: Member;
  version: number;
  pages: number;
}

export interface ContentText {
  processor: PluginName;
  // the newest of its parts'
  version: number;
  pages: number;
  parts: Part[];
}

// each processor's, by name, as texts are listed
export function contentTexts(
  members: readonly Member[],
  stored: readonly StoredText[],
): ContentText[] {
  const texts = new Map<PluginName, ContentText>();
  for (const member of members)
    for (const { hash, processor, version, pages } of stored) {
      if (hash !== member.hash) continue;
      const text = texts.get(processor) ?? {
        processor,
        version,
        pages: 0,
        parts: [],
      };
      text.version = Math.max(text.version, version);
      text.pages += pages;
      text.parts.push({ member, version, pages });
      texts.set(processor, text);
    }
  return [...texts.values()].sort((a, b) =>
    a.processor < b.processor ? -1 : 1,
  );
}

// where page (from 1) of a text is: the part, and the page of its own
export function locate({ parts }: ContentText, page: number) {
  for (const part of parts) {
    if (page <= part.pages) return { part, page };
    page -= part.pages;
  }
  return null;
}

// page (from 1) of the first part of this content, as a page of the text
export function pageIn(
  { parts }: ContentText,
  hash: ContentHash,
  page: number,
) {
  let before = 0;
  for (const part of parts) {
    if (part.member.hash === hash) return { part, page: before + page };
    before += part.pages;
  }
  return null;
}

// a part's page as a reader gets it
export const headed = ({ path }: Member, text: string) =>
  path === null ? text : `${path}\n\n${text}`;
