import { Inject, Logger, Optional } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PluginCatalog } from '../../plugins/contracts.js';
import { SearchOffError, SearchUnavailableError } from './errors.js';
import {
  EmbedderUnavailableError,
  QueryEmbedder,
  Reranker,
  RerankerUnavailableError,
  SearchMetrics,
  TextIndex,
  TextIndexUnavailableError,
  type SearchOutcome,
  type UnrankedReason,
} from './ports.js';
import { SearchTextsQuery, type TextHit } from './queries.js';

// By the words and by their meaning, or by the words alone while the query
// embedder is away or failing; the best hits then in the reranker's order,
// or in the index's while it's busy, away or failing: a search answers all
// the same. The scope goes to the index as it came: it's what the caller may
// read, and the index has no other say. Only the texts of the processors on
// are looked through, as only they are read; posts and names are no
// processor's.
@QueryHandler(SearchTextsQuery)
export class SearchTexts implements IQueryHandler<SearchTextsQuery> {
  private readonly logger = new Logger(SearchTexts.name);

  constructor(
    private readonly plugins: PluginCatalog,
    private readonly metrics: SearchMetrics,
    // none when search is off
    @Optional() private readonly index?: TextIndex,
    // none when search is off, null for BM25 only
    @Optional()
    @Inject(QueryEmbedder)
    private readonly embedder?: QueryEmbedder | null,
    // none when search is off, null for the index's order
    @Optional()
    @Inject(Reranker)
    private readonly reranker?: Reranker | null,
  ) {}

  // timed whichever way it comes out
  async execute(query: SearchTextsQuery) {
    if (!this.index) throw new SearchOffError();
    const started = performance.now();
    let outcome: SearchOutcome = 'failed';
    try {
      const hits = await this.search(this.index, query);
      outcome = 'ok';
      return hits;
    } finally {
      this.metrics.searched(outcome, (performance.now() - started) / 1000);
    }
  }

  private async search(
    index: TextIndex,
    { text, among, limit }: SearchTextsQuery,
  ) {
    const processors = this.plugins.processorNames;
    // a content's texts only by the processors on
    const scope = {
      ...among,
      contents: processors.length ? among.contents : [],
    };
    if (Object.values(scope).every((ids) => !ids.length)) return [];
    // the chunks are NFC, which the analyzers fold; a query has to be too
    const words = text.normalize('NFC');
    const vector = await this.meaningOf(words);
    // as many as the reranker takes, whatever the limit
    const size = Math.max(limit, this.reranker?.candidates ?? 0);
    const hits = await index
      .search({ text: words, vector, among: scope, processors, size })
      .catch((err: unknown) => {
        throw err instanceof TextIndexUnavailableError
          ? new SearchUnavailableError({ cause: err })
          : err;
      });
    return (await this.reranked(words, hits)).slice(0, limit);
  }

  // the query's vector; none without an embedder, or when it fails, which
  // is logged: a warning while it's away, an error otherwise (too slow,
  // another model than the index's)
  private async meaningOf(text: string) {
    try {
      return (await this.embedder?.embed([text]))?.[0];
    } catch (err) {
      const away = err instanceof EmbedderUnavailableError;
      this.failed(err, away, 'searching by the words alone');
      return undefined;
    }
  }

  // The reranker's candidates in its order, by their best snippets (a
  // page's, else a name's or a post's), ties as they were, and the rest
  // after them; or the index's order, counted by why (unranked)
  private async reranked(query: string, hits: TextHit[]) {
    if (!this.reranker || hits.length < 2) return hits;
    const top = hits.slice(0, this.reranker.candidates);
    const scores = await this.reranker
      .scores(
        query,
        top.map(({ pages, records }) => (pages[0] ?? records[0]).snippet.text),
      )
      .then(
        (scores) => scores ?? this.unranked('busy'),
        (err: unknown) =>
          this.unranked(
            err instanceof RerankerUnavailableError
              ? 'away'
              : (err as Error).name === 'TimeoutError'
                ? 'timeout'
                : 'failed',
            err,
          ),
      );
    if (!scores) return hits;
    const order = top.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
    return [...order.map((i) => top[i]), ...hits.slice(top.length)];
  }

  // The index's order kept, and why. A failure is logged: a warning while
  // it's away or past its time (on a CPU, the reranker running behind), an
  // error otherwise (another model, an answer that can't be read).
  private unranked(reason: UnrankedReason, err?: unknown) {
    this.metrics.unranked(reason);
    if (reason !== 'busy')
      this.failed(err, reason !== 'failed', "in the index's order");
    return null;
  }

  // a model's failure, which the search does without: a warning while it's
  // only away, an error with its stack when someone has to look
  private failed(err: unknown, away: boolean, then: string) {
    const said = `${then}: ${(err as Error).message}`;
    if (away) this.logger.warn(said);
    else this.logger.error(said, (err as Error).stack);
  }
}
