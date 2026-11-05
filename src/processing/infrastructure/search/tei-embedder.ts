import { Embedder, EmbedderUnavailableError } from '../../application/ports.js';

// How long an embed may take, by its number of texts. Indexing: a batch of 8
// passages takes about 3 s on 6 arm cores, given 34 s. A query: one short
// text, which someone waits on.
export const PASSAGE_TIMEOUT = (texts: number) => 10_000 + 3_000 * texts;
export const QUERY_TIMEOUT = () => 3_000;

// The server down, gone mid-request or not there yet (a container stopping
// or starting, its name not in DNS, or its old address no longer
// answering), or too busy: worth waiting out. Anything else, a timeout too,
// is the call's own failure.
const AWAY_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  // undici's: the server closed the connection before it answered, or
  // nothing took it within undici's 10 s
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
]);
const AWAY_STATUSES = new Set([429, 502, 503, 504]);

// what's read of TEI's /info
interface Info {
  model_id: string;
  // its --revision; none when started without one, or from a folder
  model_sha: string | null;
}

// the model a TEI serves, named as EMBEDDING_MODEL names it: BAAI/bge-m3 at
// 5617a9f6… is bge-m3-5617a9f6
export const modelName = ({ model_id, model_sha }: Info) =>
  [model_id.split('/').at(-1)!, model_sha?.slice(0, 8) ?? 'unpinned']
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// what kept fetch from the server, when it's one of AWAY_CODES
const awayCode = (err: unknown) => {
  if (!(err instanceof TypeError)) return null;
  const { code } = (err.cause ?? {}) as NodeJS.ErrnoException;
  return code && AWAY_CODES.has(code) ? code : null;
};

// A text embeddings inference server. Before its first embed it's asked for
// the model it serves, which must be EMBEDDING_MODEL: vectors of another
// model or revision would mix with the index's. A mismatch fails every
// embed until it's put right (indexing: errors in the log; search: by the
// words only).
export class TeiEmbedder extends Embedder {
  private checked?: Promise<void>;

  constructor(
    private readonly config: { model: string; dimensions: number },
    private readonly url: string,
    private readonly timeout: (texts: number) => number,
  ) {
    super();
  }

  async embed(texts: readonly string[]) {
    await this.check();
    const vectors = await this.call<number[][]>('/embed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // the vectors of unit length, as cosine similarity takes them; a text
      // past the model's tokens cut, not refused (a chunk is far below)
      body: JSON.stringify({ inputs: texts, normalize: true, truncate: true }),
      signal: AbortSignal.timeout(this.timeout(texts.length)),
    });
    const other = vectors.find(
      ({ length }) => length !== this.config.dimensions,
    );
    if (other)
      throw new Error(
        `EMBEDDING_DIMENSIONS is ${this.config.dimensions}, the model gives ${other.length}`,
      );
    return vectors;
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
    const served = modelName(
      await this.call<Info>('/info', {
        signal: AbortSignal.timeout(this.timeout(0)),
      }),
    );
    if (served !== this.config.model)
      throw new Error(
        `EMBEDDING_MODEL is ${this.config.model}, the embedder at ${this.url} serves ${served}: ` +
          'start it with that model and --revision, or change EMBEDDING_MODEL (a new index)',
      );
  }

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    const url = new URL(path, this.url);
    const res = await fetch(url, init).catch((err: unknown) => {
      const code = awayCode(err);
      throw code
        ? new EmbedderUnavailableError(`${url}: ${code}`, { cause: err })
        : err;
    });
    if (AWAY_STATUSES.has(res.status))
      throw new EmbedderUnavailableError(`${url} answered ${res.status}`);
    if (!res.ok)
      throw new Error(`${url} answered ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }
}
