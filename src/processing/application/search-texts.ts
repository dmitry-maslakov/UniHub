import { Optional } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { SearchOffError, SearchUnavailableError } from './errors.js';
import { TextIndex, TextIndexUnavailableError } from './ports.js';
import { SearchTextsQuery } from './queries.js';

// Keyword only: the index has no vectors yet. The hashes go to it as they
// came: they are what the caller may read, and the index has no other say.
@QueryHandler(SearchTextsQuery)
export class SearchTexts implements IQueryHandler<SearchTextsQuery> {
  // none when search is off
  constructor(@Optional() private readonly index?: TextIndex) {}

  async execute({ text, hashes, limit }: SearchTextsQuery) {
    if (!this.index) throw new SearchOffError();
    if (!hashes.length) return [];
    // the chunks are NFC, which the analyzers fold; a query has to be too
    return this.index
      .search({ text: text.normalize('NFC'), hashes, size: limit })
      .catch((err: unknown) => {
        throw err instanceof TextIndexUnavailableError
          ? new SearchUnavailableError({ cause: err })
          : err;
      });
  }
}
