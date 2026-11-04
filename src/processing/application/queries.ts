import { Query } from '@nestjs/cqrs';
import type { ContentHash, PluginName } from '@app/kernel';

// What other modules read of processing, straight from the database
// (infrastructure/read).

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
