import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { SearchUnavailableError } from './errors.js';
import { TextIndex, TextIndexUnavailableError, type PageHit } from './ports.js';
import { SearchTextsQuery } from './queries.js';

// two chunks of a page that both match show it once, by the better one
const eachPageOnce = (pages: PageHit[]) =>
  pages
    .filter(
      (hit, i) =>
        pages.findIndex(
          ({ processor, page }) =>
            processor === hit.processor && page === hit.page,
        ) === i,
    )
    .map(({ processor, version, page, snippet }) => ({
      processor,
      version,
      page,
      snippet,
    }));

// Keyword only: the index has no vectors yet. The hashes go to it as they
// came: they are what the caller may read, and the index has no other say.
@QueryHandler(SearchTextsQuery)
export class SearchTexts implements IQueryHandler<SearchTextsQuery> {
  constructor(private readonly index: TextIndex) {}

  async execute({ text, hashes, limit }: SearchTextsQuery) {
    if (!hashes.length) return [];
    // the chunks are NFC, which the analyzers fold; a query has to be too
    const hits = await this.index
      .search({ text: text.normalize('NFC'), hashes, size: limit })
      .catch((err: unknown) => {
        throw err instanceof TextIndexUnavailableError
          ? new SearchUnavailableError({ cause: err })
          : err;
      });
    return hits.map(({ hash, pages }) => ({
      hash,
      pages: eachPageOnce(pages),
    }));
  }
}
