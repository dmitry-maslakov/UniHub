import { Inject, Logger, Optional } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import type { ContentHash } from '@app/kernel';
import { contentTexts, pageIn, type Member } from '../domain/content-texts.js';
import { ContentMembers } from './content-members.js';
import { SearchOffError, SearchUnavailableError } from './errors.js';
import {
  EmbedderUnavailableError,
  QueryEmbedder,
  Reranker,
  RerankerUnavailableError,
  TextIndex,
  TextIndexUnavailableError,
  TextReads,
} from './ports.js';
import { SearchTextsQuery, type TextHit } from './queries.js';

// By the words and by their meaning, or by the words alone while the query
// embedder is away or failing; the best contents then in the reranker's
// order, or in the index's while it's busy, away or failing: a search
// answers all the same. The hashes go to the index as they came, with the
// entries of the archives among them: they are what the caller may read,
// and the index has no other say. An entry's hit comes back as one of the
// archive's that holds it (the first asked for), on the pages of the
// archive's text (content-texts.ts), with the entry's path.
@QueryHandler(SearchTextsQuery)
export class SearchTexts implements IQueryHandler<SearchTextsQuery> {
  private readonly logger = new Logger(SearchTexts.name);

  constructor(
    private readonly members: ContentMembers,
    private readonly reads: TextReads,
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

  async execute({ text, hashes, limit }: SearchTextsQuery) {
    if (!this.index) throw new SearchOffError();
    if (!hashes.length) return [];
    const members = await this.members.of(hashes);
    // each entry by the first archive asked for that holds it
    const inside = new Map<ContentHash, ContentHash>();
    for (const [archive, of] of members)
      for (const { hash } of of.slice(1))
        if (!members.has(hash) && !inside.has(hash)) inside.set(hash, archive);
    // the chunks are NFC, which the analyzers fold; a query has to be too
    const words = text.normalize('NFC');
    const vector = await this.meaningOf(words);
    // as many as the reranker takes, whatever the limit
    const size = Math.max(limit, this.reranker?.candidates ?? 0);
    const hits = await this.index
      .search({
        text: words,
        vector,
        hashes: [...hashes, ...inside.keys()],
        size,
      })
      .catch((err: unknown) => {
        throw err instanceof TextIndexUnavailableError
          ? new SearchUnavailableError({ cause: err })
          : err;
      });
    const asked = await this.asked(hits, members, inside);
    return (await this.reranked(words, asked)).slice(0, limit);
  }

  // The hits as the contents asked for: an entry's as its archive's, those
  // of one archive together in the order they came, at most 3 pages each.
  private async asked(
    hits: TextHit[],
    members: Map<ContentHash, Member[]>,
    inside: Map<ContentHash, ContentHash>,
  ) {
    const archives = new Set(
      hits.flatMap(({ hash }) => inside.get(hash) ?? []),
    );
    const of = [...archives].flatMap((archive) => members.get(archive)!);
    const stored = await this.reads.newest(of.map(({ hash }) => hash));
    const texts = new Map(
      [...archives].map((archive) => [
        archive,
        contentTexts(members.get(archive)!, stored),
      ]),
    );
    const asked = new Map<ContentHash, TextHit>();
    for (const hit of hits) {
      const archive = inside.get(hit.hash);
      const pages = !archive
        ? hit.pages
        : hit.pages.flatMap((found) => {
            const text = texts
              .get(archive)!
              .find((t) => t.processor === found.processor);
            const at = text && pageIn(text, hit.hash, found.page);
            return at
              ? [{ ...found, page: at.page, path: at.part.member.path! }]
              : [];
          });
      const hash = archive ?? hit.hash;
      const before = asked.get(hash)?.pages ?? [];
      asked.set(hash, { hash, pages: [...before, ...pages].slice(0, 3) });
    }
    return [...asked.values()].filter(({ pages }) => pages.length);
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

  // The reranker's candidates in its order, by their best snippets, ties as
  // they were, and the rest after them. When it fails, the index's order,
  // which is logged: a warning while it's away or past its time (on a CPU,
  // the reranker running behind), an error otherwise (another model, an
  // answer that can't be read)
  private async reranked(query: string, hits: TextHit[]) {
    if (!this.reranker || hits.length < 2) return hits;
    const top = hits.slice(0, this.reranker.candidates);
    const scores = await this.reranker
      .scores(
        query,
        top.map(({ pages }) => pages[0].snippet.text),
      )
      .catch((err: unknown) => {
        const behind =
          err instanceof RerankerUnavailableError ||
          (err as Error).name === 'TimeoutError';
        this.failed(err, behind, "in the index's order");
        return null;
      });
    if (!scores) return hits;
    const order = top.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
    return [...order.map((i) => top[i]), ...hits.slice(top.length)];
  }

  // a model's failure, which the search does without: a warning while it's
  // only away, an error with its stack when someone has to look
  private failed(err: unknown, away: boolean, then: string) {
    const said = `${then}: ${(err as Error).message}`;
    if (away) this.logger.warn(said);
    else this.logger.error(said, (err as Error).stack);
  }
}
