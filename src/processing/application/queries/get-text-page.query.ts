import { Query } from '@nestjs/cqrs';
import type { TextPage } from '../../domain/representation.js';

export type { TextPage };

// one page (from 1) of the newest text made of some content; the first
// processor's unless one is named. null if there's no such page
export class GetTextPageQuery extends Query<TextPage | null> {
  constructor(
    public readonly hash: string,
    public readonly page: number,
    public readonly processor?: string,
  ) {
    super();
  }
}
