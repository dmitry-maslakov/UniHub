import { Query } from '@nestjs/cqrs';
import type { ContentHash, PluginName } from '@app/kernel';

// What other modules read of processing: the texts straight from the
// database (infrastructure/read), and a search over them in the index
// (SearchTexts).

export interface TextInfo {
  processor: PluginName;
  version: number;
  pages: number;
}

export interface TextPage extends TextInfo {
  page: number;
  text: string;
}

// what processors made of some content: the newest version of each, with
// its number of pages (slides, sections), without the text
export class ListTextsQuery extends Query<TextInfo[]> {
  constructor(public readonly hash: ContentHash) {
    super();
  }
}

// one page (from 1) of the newest text made of some content; the first
// processor's unless one is named. null if there's no such page
export class GetTextPageQuery extends Query<TextPage | null> {
  constructor(
    public readonly hash: ContentHash,
    public readonly page: number,
    public readonly processor?: PluginName,
  ) {
    super();
  }
}

// A fragment of a chunk's text and where in it the query's words are:
// UTF-16 offsets into `text` (the chunk as indexed, NFC), each [start, end).
// Plain text: whatever HTML the source had comes as it was.
export interface Snippet {
  text: string;
  highlights: [start: number, end: number][];
}

export interface TextHit {
  hash: ContentHash;
  // best first, each page once, by its best chunk (at most 3)
  pages: {
    processor: PluginName;
    version: number;
    page: number;
    snippet: Snippet;
  }[];
}

// The contents among these whose newest texts match, best first, at most
// `limit`, with their best pages. The index knows nothing of who reads
// what: `hashes` are all it looks through.
export class SearchTextsQuery extends Query<TextHit[]> {
  constructor(
    public readonly text: string,
    public readonly hashes: readonly ContentHash[],
    public readonly limit: number,
  ) {
    super();
  }
}
