import { Query } from '@nestjs/cqrs';
import type { TextInfo } from '../../domain/representation.js';

export type { TextInfo };

// what processors made of some content: the newest version of each, with
// its number of pages (slides, sections), without the text
export class ListTextsQuery extends Query<TextInfo[]> {
  constructor(public readonly hash: string) {
    super();
  }
}
