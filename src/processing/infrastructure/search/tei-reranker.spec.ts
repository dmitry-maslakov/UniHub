import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ZodError } from 'zod';
import { TeiReranker } from './tei-reranker.js';

const TEI = 'http://reranker.test';
const server = setupServer();

interface RerankRequest {
  query: string;
  texts: string[];
  raw_scores: boolean;
  truncate: boolean;
}

// a TEI answering a rerank with `rerank` (by default, each text scored by
// its length, best first, as TEI sorts them); keeps what it was asked
function tei(
  rerank: (body: RerankRequest) => Response | Promise<Response> = ({ texts }) =>
    HttpResponse.json(
      texts
        .map((text, index) => ({ index, score: text.length / 100 }))
        .toSorted((a, b) => b.score - a.score),
    ),
) {
  const asked: RerankRequest[] = [];
  server.use(
    http.post(`${TEI}/rerank`, async ({ request }) => {
      const body = (await request.json()) as RerankRequest;
      asked.push(body);
      return rerank(body);
    }),
  );
  return asked;
}

const reranker = () => new TeiReranker({ url: TEI, candidates: 20 });

// what fetch rejects with when it can't reach a server (undici's shape)
const unreachable = (code: string) =>
  new TypeError('fetch failed', {
    cause: Object.assign(new Error(`connect ${code}`), { code }),
  });

describe('TeiReranker', () => {
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it("asks the texts' scores, the texts cut to the model, and answers them in the texts' order", async () => {
    const asked = tei();

    expect(await reranker().scores('semafor', ['ab', 'abcd', 'a'])).toEqual([
      0.02, 0.04, 0.01,
    ]);
    expect(asked).toEqual([
      {
        query: 'semafor',
        texts: ['ab', 'abcd', 'a'],
        raw_scores: false,
        truncate: true,
      },
    ]);
    expect(reranker().candidates).toBe(20);
  });

  it('answers null at once to a query while another is scored, and scores the next one after', async () => {
    let answer!: () => void;
    const answered = new Promise<void>((done) => (answer = done));
    const asked = tei(async ({ texts }) => {
      await answered;
      return HttpResponse.json(texts.map((_, index) => ({ index, score: 1 })));
    });
    const tei1 = reranker();

    const first = tei1.scores('semafor', ['a']);
    expect(await tei1.scores('lozinka', ['b'])).toBeNull();
    answer();
    expect(await first).toEqual([1]);
    expect(await tei1.scores('lozinka', ['b'])).toEqual([1]);

    expect(asked.map(({ query }) => query)).toEqual(['semafor', 'lozinka']);
  });

  it('scores the next query after one that failed', async () => {
    tei(() => new HttpResponse(null, { status: 503 }));
    const tei1 = reranker();
    await expect(tei1.scores('semafor', ['a'])).rejects.toThrow(
      `${TEI}/rerank answered 503`,
    );

    tei();
    expect(await tei1.scores('semafor', ['a'])).toEqual([0.01]);
  });

  // one missing would go last, or first, by no score of its own
  it('refuses an answer that leaves a text unscored', async () => {
    tei(() => HttpResponse.json([{ index: 0, score: 0.9 }]));

    await expect(reranker().scores('semafor', ['a', 'b'])).rejects.toThrow(
      ZodError,
    );
  });

  it('fails while the server is away, too busy or refusing, naming it', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      unreachable('ECONNREFUSED'),
    );
    await expect(reranker().scores('semafor', ['a'])).rejects.toThrow(
      `${TEI}/rerank: ECONNREFUSED`,
    );

    tei(() => new HttpResponse(null, { status: 429 }));
    await expect(reranker().scores('semafor', ['a'])).rejects.toThrow(
      `${TEI}/rerank answered 429`,
    );

    tei(() => new HttpResponse('too many texts', { status: 413 }));
    await expect(reranker().scores('semafor', ['a'])).rejects.toThrow(
      `${TEI}/rerank answered 413: too many texts`,
    );
  });

  it('gives a query 5 s, then fails', async () => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    const given = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() => timeout(50));
    tei(async () => {
      await delay('infinite');
      return HttpResponse.json([]);
    });

    await expect(reranker().scores('semafor', ['a'])).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    expect(given).toHaveBeenCalledWith(5_000);
  });
});
