import { z } from 'zod';
import {
  AWAY_STATUSES,
  isConnectionError,
} from '../../../platform/errors/is-connection-error.js';
import { Embedder, EmbedderUnavailableError } from '../../application/ports.js';

// Texts per embed: a bigger batch gets through no faster on a CPU, and a
// search's query, on the same model, would wait longer behind it.
const BATCH = 8;

// How long an embed may take, by its number of texts. Indexing: a batch of 8
// passages takes about 3 s on 6 arm cores, given 34 s. A query: one short
// text, which someone waits on.
export const PASSAGE_TIMEOUT = (texts: number) => 10_000 + 3_000 * texts;
export const QUERY_TIMEOUT = () => 3_000;

// what's read of TEI's /info
const info = z.object({
  model_id: z.string(),
  // its --revision; none when started without one, or from a folder
  model_sha: z.string().nullable(),
});

// the model a TEI serves, named as EMBEDDING_MODEL names it: BAAI/bge-m3 at
// 5617a9f6… is bge-m3-5617a9f6
export const modelName = ({ model_id, model_sha }: z.infer<typeof info>) =>
  [model_id.split('/').at(-1)!, model_sha?.slice(0, 8) ?? 'unpinned']
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// A text embeddings inference server. Before its first embed it's asked for
// the model it serves, which must be EMBEDDING_MODEL: vectors of another
// model or revision would mix with the index's. A mismatch fails every
// embed until it's put right (indexing: errors in the log; search: by the
// words only). The server down, gone mid-request, not there yet or too busy
// is worth waiting out; anything else, a timeout too, is the call's own
// failure.
export class TeiEmbedder extends Embedder {
  private checked?: Promise<void>;
  private readonly vector: z.ZodArray<z.ZodNumber>;

  constructor(
    private readonly config: { model: string; dimensions: number },
    private readonly url: string,
    private readonly timeout: (texts: number) => number,
  ) {
    super();
    this.vector = z.array(z.number()).length(config.dimensions, {
      error: ({ input }) =>
        `EMBEDDING_DIMENSIONS is ${config.dimensions}, the model gives ${(input as number[]).length}`,
    });
  }

  async embed(texts: readonly string[], signal?: AbortSignal) {
    await this.check();
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH)
      vectors.push(...(await this.batch(texts.slice(i, i + BATCH), signal)));
    return vectors;
  }

  // a vector per text, of the model's dimensions
  private async batch(texts: string[], signal?: AbortSignal) {
    const timeout = AbortSignal.timeout(this.timeout(texts.length));
    const answer = await this.call('/embed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // the vectors of unit length, as cosine similarity takes them; a text
      // past the model's tokens cut, not refused (a chunk is far below)
      body: JSON.stringify({ inputs: texts, normalize: true, truncate: true }),
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
    return z.array(this.vector).length(texts.length).parse(answer);
  }

  // once, asked again after it failed
  private check() {
    this.checked ??= this.served().catch((err: unknown) => {
      this.checked = undefined;
      throw err;
    });
    return this.checked;
  }

  private async served() {
    const answer = await this.call('/info', {
      signal: AbortSignal.timeout(this.timeout(0)),
    });
    const served = modelName(info.parse(answer));
    if (served !== this.config.model)
      throw new Error(
        `EMBEDDING_MODEL is ${this.config.model}, the embedder at ${this.url} serves ${served}: ` +
          'start it with that model and --revision, or change EMBEDDING_MODEL (a new index)',
      );
  }

  private async call(path: string, init: RequestInit): Promise<unknown> {
    const url = new URL(path, this.url);
    const res = await fetch(url, init).catch((err: unknown) => {
      // fetch's TypeError says only 'fetch failed', its cause what kept it
      const cause = (err as Error | undefined)?.cause as
        NodeJS.ErrnoException | undefined;
      if (!isConnectionError(cause)) throw err;
      throw new EmbedderUnavailableError(
        `${url}: ${cause?.code ?? cause?.message}`,
        { cause: err },
      );
    });
    if (AWAY_STATUSES.has(res.status))
      throw new EmbedderUnavailableError(`${url} answered ${res.status}`);
    if (!res.ok)
      throw new Error(`${url} answered ${res.status}: ${await res.text()}`);
    return res.json();
  }
}
