import { Inject, Logger, Optional } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { SearchOffError, SearchUnavailableError } from './errors.js';
import {
  EmbedderUnavailableError,
  QueryEmbedder,
  TextIndex,
  TextIndexUnavailableError,
} from './ports.js';
import { SearchTextsQuery } from './queries.js';

// By the words and by their meaning, or by the words alone while the query
// embedder is away or failing: a search answers all the same. The hashes go
// to the index as they came: they are what the caller may read, and the
// index has no other say.
@QueryHandler(SearchTextsQuery)
export class SearchTexts implements IQueryHandler<SearchTextsQuery> {
  private readonly logger = new Logger(SearchTexts.name);

  constructor(
    // none when search is off
    @Optional() private readonly index?: TextIndex,
    // none when search is off, null for BM25 only
    @Optional()
    @Inject(QueryEmbedder)
    private readonly embedder?: QueryEmbedder | null,
  ) {}

  async execute({ text, hashes, limit }: SearchTextsQuery) {
    if (!this.index) throw new SearchOffError();
    if (!hashes.length) return [];
    // the chunks are NFC, which the analyzers fold; a query has to be too
    const words = text.normalize('NFC');
    const vector = await this.meaningOf(words);
    return this.index
      .search({ text: words, vector, hashes, size: limit })
      .catch((err: unknown) => {
        throw err instanceof TextIndexUnavailableError
          ? new SearchUnavailableError({ cause: err })
          : err;
      });
  }

  // the query's vector; none without an embedder, or when it fails, which
  // is logged: a warning while it's away, an error otherwise (too slow,
  // another model than the index's)
  private async meaningOf(text: string) {
    try {
      return (await this.embedder?.embed([text]))?.[0];
    } catch (err) {
      const said = `searching by the words alone: ${(err as Error).message}`;
      if (err instanceof EmbedderUnavailableError) this.logger.warn(said);
      else this.logger.error(said, (err as Error).stack);
      return undefined;
    }
  }
}
