import { z } from 'zod';
import { Reranker, RerankerUnavailableError } from '../../application/ports.js';
import { callTei } from './tei.js';

// Someone waits on the search: past this it answers in the index's order.
// 20 texts of 400 characters take about 1.3 s on 6 arm cores, 3 s on 8
// amd64 ones (README, Deploying search).
const TIMEOUT_MS = 5_000;

// what TEI's /rerank answers: a score per text, by its place, best first
const ranked = z.array(z.object({ index: z.int(), score: z.number() }));

// A TEI server of a reranker, one query at a time: on a CPU a second query
// would only wait behind the first in TEI's queue, so it gets null at once
// (the app runs as one process, so a flag does). The server down, gone
// mid-request or too busy is worth waiting out; anything else, a timeout
// too, is the call's own failure. Either is the search's to log, which keeps
// its order then.
export class TeiReranker extends Reranker {
  readonly candidates: number;
  private readonly url: URL;
  private busy = false;

  constructor(config: { url: string; candidates: number }) {
    super();
    this.url = new URL('/rerank', config.url);
    this.candidates = config.candidates;
  }

  async scores(query: string, texts: readonly string[]) {
    if (this.busy) return null;
    this.busy = true;
    try {
      const answer = await callTei(
        this.url,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // scores 0 to 1; a text past the model's tokens cut, not refused
          body: JSON.stringify({
            query,
            texts,
            raw_scores: false,
            truncate: true,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
        RerankerUnavailableError,
      );
      const byIndex = new Map(
        ranked.parse(answer).map(({ index, score }) => [index, score]),
      );
      // a text left unscored fails, rather than going last
      return z.array(z.number()).parse(texts.map((_, i) => byIndex.get(i)));
    } finally {
      this.busy = false;
    }
  }
}
