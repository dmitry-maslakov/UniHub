import { createServer, type AddressInfo, type Server } from 'node:net';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ZodError } from 'zod';
import { EmbedderUnavailableError } from '../../application/ports.js';
import {
  modelName,
  PASSAGE_TIMEOUT,
  QUERY_TIMEOUT,
  TeiEmbedder,
} from './tei-embedder.js';

const TEI = 'http://embedder.test';
const config = { model: 'bge-m3-5617a9f6', dimensions: 3 };
const bgeM3 = {
  model_id: 'BAAI/bge-m3',
  model_sha: '5617a9f61b028005a4858fdac845db406aefb181',
};
const server = setupServer();

interface EmbedRequest {
  inputs: string[];
  normalize: boolean;
  truncate: boolean;
}

// a TEI serving `served`, answering an embed with `embed` (a vector per
// input, by its place, unless told otherwise); keeps what it was asked
function tei({
  served = bgeM3,
  embed = ({ inputs }: EmbedRequest) =>
    HttpResponse.json(inputs.map((_, i) => [i, 0, 1])),
}: {
  served?: { model_id: string; model_sha: string | null };
  embed?: (body: EmbedRequest) => Response | Promise<Response>;
} = {}) {
  const asked: (string | EmbedRequest)[] = [];
  server.use(
    http.get(`${TEI}/info`, () => {
      asked.push('info');
      return HttpResponse.json({ ...served, max_batch_tokens: 2048 });
    }),
    http.post(`${TEI}/embed`, async ({ request }) => {
      const body = (await request.json()) as EmbedRequest;
      asked.push(body);
      return embed(body);
    }),
  );
  return asked;
}

const embedder = (timeout = PASSAGE_TIMEOUT) =>
  new TeiEmbedder(config, TEI, timeout);

// what fetch rejects with when it can't reach a server (undici's shape)
const unreachable = (code: string) =>
  new TypeError('fetch failed', {
    cause: Object.assign(new Error(`connect ${code}`), { code }),
  });

describe('modelName', () => {
  it('names a model by its last part and revision, as an index name may hold it', () => {
    expect(modelName(bgeM3)).toBe('bge-m3-5617a9f6');
    expect(
      modelName({
        model_id: 'sentence-transformers/all-MiniLM-L6-v2',
        model_sha: '1110a243fdf4706b3f48f1d95db1a4f5529b4d41',
      }),
    ).toBe('all-minilm-l6-v2-1110a243');
    expect(modelName({ model_id: 'BAAI/bge-m3', model_sha: null })).toBe(
      'bge-m3-unpinned',
    );
  });
});

describe('TeiEmbedder', () => {
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it('asks the model once, then embeds the texts as unit vectors, cut to the model, in their order', async () => {
    const asked = tei();
    const tei1 = embedder();

    expect(await tei1.embed(['a', 'b'])).toEqual([
      [0, 0, 1],
      [1, 0, 1],
    ]);
    await tei1.embed(['c']);

    expect(asked).toEqual([
      'info',
      { inputs: ['a', 'b'], normalize: true, truncate: true },
      { inputs: ['c'], normalize: true, truncate: true },
    ]);
  });

  it('refuses a server of another model, revision, or none pinned, and asks it again next time', async () => {
    for (const [served, named] of [
      [{ ...bgeM3, model_sha: 'abcdef0123' }, 'bge-m3-abcdef01'],
      [{ ...bgeM3, model_sha: null }, 'bge-m3-unpinned'],
    ] as const) {
      const asked = tei({ served });
      const failed = embedder().embed(['a']);

      await expect(failed).rejects.toThrow(
        `EMBEDDING_MODEL is bge-m3-5617a9f6, the embedder at ${TEI} serves ${named}`,
      );
      await expect(failed).rejects.not.toBeInstanceOf(EmbedderUnavailableError);
      expect(asked).toEqual(['info']);
    }

    const restarted = embedder();
    tei({ served: { ...bgeM3, model_sha: 'abcdef0123' } });
    await expect(restarted.embed(['a'])).rejects.toThrow('serves');
    tei();
    expect(await restarted.embed(['a'])).toHaveLength(1);
  });

  it('embeds eight texts at a time, each batch given its own time, the vectors in their order', async () => {
    const asked = tei();
    const timeout = vi.fn(() => 1_000);
    const texts = Array.from({ length: 19 }, (_, i) => `page ${i + 1}`);

    const vectors = await new TeiEmbedder(config, TEI, timeout).embed(texts);

    expect(asked.slice(1).map((body) => (body as EmbedRequest).inputs)).toEqual(
      [texts.slice(0, 8), texts.slice(8, 16), texts.slice(16)],
    );
    // the fake answers each text's place in its batch
    expect(vectors.map(([i]) => i)).toEqual(texts.map((_, i) => i % 8));
    expect(timeout.mock.calls).toEqual([[0], [8], [8], [3]]);
  });

  it('stops at the signal, asking for no batch after', async () => {
    const stop = new AbortController();
    const asked = tei({
      embed: ({ inputs }) => {
        stop.abort('the app is shutting down');
        return HttpResponse.json(inputs.map(() => [0, 0, 1]));
      },
    });
    const texts = Array.from({ length: 9 }, (_, i) => `page ${i + 1}`);

    await expect(embedder().embed(texts, stop.signal)).rejects.toBe(
      'the app is shutting down',
    );
    expect(asked).toHaveLength(2);
  });

  it('refuses vectors of other than EMBEDDING_DIMENSIONS', async () => {
    tei({ embed: () => HttpResponse.json([[0.6, 0.8]]) });

    await expect(embedder().embed(['a'])).rejects.toThrow(
      'EMBEDDING_DIMENSIONS is 3, the model gives 2',
    );
  });

  // one missing would leave its chunk indexed with no vector, out of knn's
  // reach
  it('refuses an answer of other than a vector per text', async () => {
    tei({ embed: () => HttpResponse.json([[0, 0, 1]]) });

    const short = embedder().embed(['a', 'b']);
    await expect(short).rejects.toBeInstanceOf(ZodError);
    await expect(short).rejects.not.toBeInstanceOf(EmbedderUnavailableError);
  });

  it('takes a server down, not found yet or too busy for an outage', async () => {
    for (const code of [
      'ECONNREFUSED',
      'ECONNRESET',
      'ENOTFOUND',
      'EAI_AGAIN',
      'UND_ERR_SOCKET',
      'UND_ERR_CONNECT_TIMEOUT',
    ]) {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(unreachable(code));
      const failed = embedder().embed(['a']);
      await expect(failed).rejects.toBeInstanceOf(EmbedderUnavailableError);
      await expect(failed).rejects.toMatchObject({
        kind: 'unavailable',
        reason: 'EMBEDDER_UNAVAILABLE',
        message: `${TEI}/info: ${code}`,
      });
    }
    for (const status of [429, 502, 503, 504]) {
      tei({ embed: () => new HttpResponse(null, { status }) });
      await expect(embedder().embed(['a'])).rejects.toBeInstanceOf(
        EmbedderUnavailableError,
      );
    }
  });

  it("takes any other failure for the call's own, one past its time too", async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      unreachable('UND_ERR_INVALID_ARG'),
    );
    await expect(embedder().embed(['a'])).rejects.not.toBeInstanceOf(
      EmbedderUnavailableError,
    );

    tei({ embed: () => new HttpResponse('too long', { status: 413 }) });
    const refused = embedder().embed(['a']);
    await expect(refused).rejects.toThrow(
      `${TEI}/embed answered 413: too long`,
    );
    await expect(refused).rejects.not.toBeInstanceOf(EmbedderUnavailableError);

    tei({
      embed: async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      },
    });
    const stuck = embedder(() => 50).embed(['a']);
    await expect(stuck).rejects.toMatchObject({ name: 'TimeoutError' });
    await expect(stuck).rejects.not.toBeInstanceOf(EmbedderUnavailableError);
  });

  it('gives a call its time by its number of texts: a batch of passages much longer than a query', async () => {
    tei();
    const timeout = vi.fn(() => 1_000);

    await new TeiEmbedder(config, TEI, timeout).embed(['a', 'b']);

    expect(timeout.mock.calls).toEqual([[0], [2]]);
    expect(PASSAGE_TIMEOUT(8)).toBe(34_000);
    expect(QUERY_TIMEOUT()).toBe(3_000);
  });
});

// undici's errors, which an outage is told by, as fetch really rejects with
// them: what a TEI stopped mid-request, or gone, gives
describe('TeiEmbedder, on a real socket', () => {
  const listening = async (server: Server) => {
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };

  it('takes a refused connection for an outage', async () => {
    const closed = createServer();
    const url = await listening(closed);
    await new Promise((done) => closed.close(done));

    await expect(
      new TeiEmbedder(config, url, QUERY_TIMEOUT).embed(['a']),
    ).rejects.toBeInstanceOf(EmbedderUnavailableError);
  });

  it('takes a connection closed before the answer for an outage', async () => {
    const closing = createServer((socket) =>
      socket.once('data', () => socket.destroy()),
    );
    const url = await listening(closing);

    await expect(
      new TeiEmbedder(config, url, QUERY_TIMEOUT).embed(['a']),
    ).rejects.toMatchObject({
      reason: 'EMBEDDER_UNAVAILABLE',
      message: `${url}/info: UND_ERR_SOCKET`,
    });
    await new Promise((done) => closing.close(done));
  });
});
