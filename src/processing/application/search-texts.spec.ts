import { setTimeout } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import { PluginName, type ContentHash } from '@app/kernel';
import { catalogOf, processor } from '../../../test/discovered-plugins.js';
import { FakeEmbedder, FakeReranker } from '../../../test/fake-models.js';
import { sha256 } from '../../../test/sha256.js';
import { SearchOffError, SearchUnavailableError } from './errors.js';
import {
  EmbedderUnavailableError,
  RerankerUnavailableError,
  TextIndexUnavailableError,
  type QueryEmbedder,
  type Reranker,
} from './ports.js';
import {
  InMemoryTextIndex,
  RecordedSearchMetrics,
} from './processing.fakes.js';
import { SearchTextsQuery, type TextHit } from './queries.js';
import { SearchTexts } from './search-texts.js';

const lecture = sha256('%PDF lecture');
const notes = sha256('notes');
// the processors on
const plugins = catalogOf({
  processors: [
    processor('office-text', ['.pdf']),
    processor('plain-text', ['.txt']),
  ],
});
const processors = ['office-text', 'plain-text'];

const hit = (hash: ContentHash, ...pages: number[]): TextHit => ({
  hash,
  pages: pages.map((page) => ({
    processor: PluginName.parse('office-text'),
    version: 2,
    page,
    snippet: { text: `page ${page}`, highlights: [[0, 4]] },
  })),
  records: [],
});

// a content whose best page has this snippet, and whose others don't count
const saying = (text: string, ...others: string[]): TextHit => ({
  hash: sha256(text),
  pages: [text, ...others].map((snippet, i) => ({
    processor: PluginName.parse('office-text'),
    version: 2,
    page: i + 1,
    snippet: { text: snippet, highlights: [] },
  })),
  records: [],
});

// what a search looks through: these contents, and no records
const contents = (hashes: ContentHash[]) => ({
  contents: hashes,
  posts: [],
  files: [],
  archives: [],
});

// by the words alone unless there's an embedder, in the index's order
// unless there's a reranker
function searching(
  hits: TextHit[] = [],
  {
    embedder,
    reranker,
  }: { embedder?: QueryEmbedder; reranker?: Reranker } = {},
) {
  const index = new InMemoryTextIndex();
  index.hits = hits;
  const metrics = new RecordedSearchMetrics();
  return {
    index,
    metrics,
    search: new SearchTexts(plugins, metrics, index, embedder, reranker),
  };
}

describe('SearchTexts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('answers none among no contents, without asking the index', async () => {
    const embedder = new FakeEmbedder(4);
    const embed = vi.spyOn(embedder, 'embed');
    const { index, search } = searching([hit(lecture, 1)], { embedder });

    expect(
      await search.execute(new SearchTextsQuery('semafor', contents([]), 10)),
    ).toEqual([]);
    expect(index.searched).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  it('answers none with no processor on, without asking the index', async () => {
    const index = new InMemoryTextIndex();
    index.hits = [hit(lecture, 1)];
    const search = new SearchTexts(
      catalogOf({}),
      new RecordedSearchMetrics(),
      index,
    );

    expect(
      await search.execute(
        new SearchTextsQuery('semafor', contents([lecture]), 10),
      ),
    ).toEqual([]);
    expect(index.searched).toEqual([]);
  });

  // posts and names are no processor's
  it('looks through the posts and names given with no processor on, but no texts', async () => {
    const index = new InMemoryTextIndex();
    const search = new SearchTexts(
      catalogOf({}),
      new RecordedSearchMetrics(),
      index,
    );
    const among = {
      contents: [lecture],
      posts: ['post-1'],
      files: ['file-1'],
      archives: [lecture],
    };

    await search.execute(new SearchTextsQuery('semafor', among, 10));

    expect(index.searched).toEqual([
      {
        text: 'semafor',
        among: { ...among, contents: [] },
        processors: [],
        size: 10,
      },
    ]);
  });

  // a processor turned off keeps its texts in the index, out of sight
  it('asks the index for that many among the contents given, by the processors on, the words NFC', async () => {
    const { index, search } = searching();
    const hashes = [lecture, notes];

    await search.execute(
      new SearchTextsQuery('C\u030Cac\u030Cak', contents(hashes), 5),
    );

    expect(index.searched).toEqual([
      { text: 'Čačak', among: contents(hashes), processors, size: 5 },
    ]);
    expect(index.searched[0].among.contents).toBe(hashes);
  });

  it('asks by the meaning too, of the words as NFC', async () => {
    const embedder = new FakeEmbedder(4);
    const embed = vi.spyOn(embedder, 'embed');
    const { index, search } = searching([], { embedder });

    await search.execute(
      new SearchTextsQuery('C\u030Cac\u030Cak', contents([notes]), 5),
    );

    expect(embed).toHaveBeenCalledWith(['Čačak']);
    expect(index.searched).toEqual([
      {
        text: 'Čačak',
        vector: (await embedder.embed(['Čačak']))[0],
        among: contents([notes]),
        processors,
        size: 5,
      },
    ]);
  });

  it('asks by the words alone while the embedder is away, saying so in a warning', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockReturnValue();
    const embedder = new FakeEmbedder(4);
    vi.spyOn(embedder, 'embed').mockRejectedValue(
      new EmbedderUnavailableError('http://embedder/info: ECONNREFUSED'),
    );
    const hits = [hit(notes, 4)];
    const { index, search } = searching(hits, { embedder });

    expect(
      await search.execute(
        new SearchTextsQuery('semafor', contents([notes]), 5),
      ),
    ).toEqual(hits);
    expect(index.searched).toEqual([
      { text: 'semafor', among: contents([notes]), processors, size: 5 },
    ]);
    expect(index.searched[0].vector).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'searching by the words alone: http://embedder/info: ECONNREFUSED',
    );
  });

  // too slow, or a model other than the index's: someone has to look
  it('asks by the words alone when the embedder fails otherwise, logging an error', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockReturnValue();
    const embedder = new FakeEmbedder(4);
    vi.spyOn(embedder, 'embed').mockRejectedValue(
      new Error('EMBEDDING_MODEL is bge-m3-5617a9f6, the embedder at …'),
    );
    const { index, search } = searching([], { embedder });

    await search.execute(new SearchTextsQuery('semafor', contents([notes]), 5));

    expect(index.searched[0].vector).toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('searching by the words alone: EMBEDDING_MODEL'),
      expect.any(String),
    );
  });

  it('answers the contents as the index found them', async () => {
    const hits = [hit(notes, 4), hit(lecture, 3, 1)];
    const { search } = searching(hits);

    expect(
      await search.execute(
        new SearchTextsQuery('semafor', contents([lecture, notes]), 10),
      ),
    ).toEqual(hits);
  });

  it('asks the index for as many as the reranker takes, and answers the limit', async () => {
    const hits = ['a', 'b', 'c'].map((text) => saying(text));
    const { index, search } = searching(hits, {
      reranker: new FakeReranker({ candidates: 3 }),
    });

    expect(
      await search.execute(
        new SearchTextsQuery('semafor', contents([notes]), 2),
      ),
    ).toHaveLength(2);
    await search.execute(new SearchTextsQuery('semafor', contents([notes]), 5));

    expect(index.searched.map(({ size }) => size)).toEqual([3, 5]);
  });

  // FakeReranker scores the query's words each text has
  it("puts the reranker's candidates in its order, by their best snippets, ties and the rest as they were", async () => {
    const reranker = new FakeReranker({ candidates: 3 });
    const scores = vi.spyOn(reranker, 'scores');
    const one = saying('semafor', 'semafor tajna lozinka');
    const all = saying('semafor tajna lozinka');
    const tie = saying('o semaforima: semafor');
    const past = saying('semafor tajna lozinka, opet');
    const { search, metrics } = searching([one, all, tie, past], {
      reranker,
    });

    expect(
      await search.execute(
        new SearchTextsQuery('semafor tajna lozinka', contents([notes]), 10),
      ),
    ).toEqual([all, one, tie, past]);
    expect(metrics.unrankedBy).toEqual([]);
    expect(scores).toHaveBeenCalledWith('semafor tajna lozinka', [
      'semafor',
      'semafor tajna lozinka',
      'o semaforima: semafor',
    ]);
  });

  it('reranks a post or a file found by its name by its best snippet, as a content by its best page', async () => {
    const reranker = new FakeReranker({ candidates: 3 });
    const scores = vi.spyOn(reranker, 'scores');
    const record = (text: string): TextHit => ({
      hash: sha256(text),
      pages: [],
      records: [
        {
          kind: 'post',
          record: text,
          member: null,
          snippet: { text, highlights: [] },
        },
      ],
    });
    const hits = [record('semafor'), saying('semafor tajna lozinka')];

    expect(
      await searching(hits, { reranker }).search.execute(
        new SearchTextsQuery('semafor tajna lozinka', contents([notes]), 10),
      ),
    ).toEqual([hits[1], hits[0]]);
    expect(scores).toHaveBeenCalledWith('semafor tajna lozinka', [
      'semafor',
      'semafor tajna lozinka',
    ]);
  });

  it('asks the reranker of the words as NFC, and not about one content', async () => {
    const reranker = new FakeReranker();
    const scores = vi.spyOn(reranker, 'scores');
    const hits = [saying('Čačak'), saying('Cacak')];

    await searching(hits, { reranker }).search.execute(
      new SearchTextsQuery('Čačak', contents([notes]), 5),
    );
    await searching(hits.slice(0, 1), { reranker }).search.execute(
      new SearchTextsQuery('Čačak', contents([notes]), 5),
    );

    expect(scores.mock.calls).toEqual([['Čačak', ['Čačak', 'Cacak']]]);
  });

  it("answers in the index's order while the reranker is busy with another query", async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const reranker: Reranker = new FakeReranker();
    vi.spyOn(reranker, 'scores').mockResolvedValue(null);
    const hits = [saying('semafor'), saying('semafor tajna lozinka')];
    const { search, metrics } = searching(hits, { reranker });

    expect(
      await search.execute(
        new SearchTextsQuery('semafor tajna lozinka', contents([notes]), 10),
      ),
    ).toEqual(hits);
    expect(warn).not.toHaveBeenCalled();
    expect(metrics.unrankedBy).toEqual(['busy']);
  });

  // away or past its time: the reranker running behind on a CPU, not the
  // search failing
  it("answers in the index's order while the reranker is away or slow, saying so in a warning", async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockReturnValue();
    const error = vi.spyOn(Logger.prototype, 'error');
    const reranker = new FakeReranker();
    vi.spyOn(reranker, 'scores')
      .mockRejectedValueOnce(
        new RerankerUnavailableError('http://reranker/rerank: ECONNREFUSED'),
      )
      .mockRejectedValueOnce(
        new DOMException(
          'The operation was aborted due to timeout',
          'TimeoutError',
        ),
      );
    const hits = [saying('semafor'), saying('semafor tajna lozinka')];
    const { search, metrics } = searching(hits, { reranker });
    const asked = () =>
      search.execute(
        new SearchTextsQuery('semafor tajna lozinka', contents([notes]), 10),
      );

    expect(await asked()).toEqual(hits);
    expect(await asked()).toEqual(hits);
    expect(warn.mock.calls).toEqual([
      ["in the index's order: http://reranker/rerank: ECONNREFUSED"],
      ["in the index's order: The operation was aborted due to timeout"],
    ]);
    expect(error).not.toHaveBeenCalled();
    expect(metrics.unrankedBy).toEqual(['away', 'timeout']);
  });

  // another model than a reranker, an answer that can't be read: someone
  // has to look
  it("answers in the index's order when the reranker fails otherwise, logging an error", async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockReturnValue();
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const reranker = new FakeReranker();
    vi.spyOn(reranker, 'scores').mockRejectedValue(
      new Error('http://reranker/rerank answered 424: not a reranker'),
    );
    const hits = [saying('semafor'), saying('semafor tajna lozinka')];
    const { search, metrics } = searching(hits, { reranker });

    expect(
      await search.execute(
        new SearchTextsQuery('semafor tajna lozinka', contents([notes]), 10),
      ),
    ).toEqual(hits);
    expect(error).toHaveBeenCalledWith(
      "in the index's order: http://reranker/rerank answered 424: not a reranker",
      expect.any(String),
    );
    expect(warn).not.toHaveBeenCalled();
    expect(metrics.unrankedBy).toEqual(['failed']);
  });

  it('answers an index away or stuck as search being unavailable', async () => {
    const { index, search } = searching();
    const away = new TextIndexUnavailableError('connect ECONNREFUSED');
    vi.spyOn(index, 'search').mockRejectedValue(away);

    const failed = search.execute(
      new SearchTextsQuery('semafor', contents([notes]), 10),
    );

    await expect(failed).rejects.toBeInstanceOf(SearchUnavailableError);
    await expect(failed).rejects.toMatchObject({
      kind: 'unavailable',
      reason: 'SEARCH_UNAVAILABLE',
      message: 'search is unavailable, try again later',
      cause: away,
    });
  });

  it('answers search being off without an index, whatever it is asked', async () => {
    const metrics = new RecordedSearchMetrics();
    const search = new SearchTexts(plugins, metrics);

    for (const hashes of [[notes], []]) {
      const failed = search.execute(
        new SearchTextsQuery('semafor', contents(hashes), 10),
      );
      await expect(failed).rejects.toBeInstanceOf(SearchOffError);
      await expect(failed).rejects.toMatchObject({
        kind: 'unavailable',
        reason: 'SEARCH_OFF',
      });
    }
    // no search, nothing timed
    expect(metrics.searches).toEqual([]);
  });

  it('times each search in seconds, one that failed too', async () => {
    const { index, search, metrics } = searching([hit(notes, 1)]);
    const answered = index.search.bind(index);
    vi.spyOn(index, 'search')
      .mockImplementationOnce(async (query) => {
        await setTimeout(20);
        return answered(query);
      })
      .mockRejectedValueOnce(new TextIndexUnavailableError('ECONNREFUSED'));

    await search.execute(
      new SearchTextsQuery('semafor', contents([notes]), 10),
    );
    await expect(
      search.execute(new SearchTextsQuery('semafor', contents([notes]), 10)),
    ).rejects.toBeInstanceOf(SearchUnavailableError);

    expect(metrics.searches.map(({ outcome }) => outcome)).toEqual([
      'ok',
      'failed',
    ]);
    expect(metrics.searches[0].seconds).toBeGreaterThan(0.015);
    expect(metrics.searches[0].seconds).toBeLessThan(1);
  });

  it('lets any other failure through as it came', async () => {
    const { index, search } = searching();
    const bug = new Error('the number of terms exceeded the allowed maximum');
    vi.spyOn(index, 'search').mockRejectedValue(bug);

    await expect(
      search.execute(new SearchTextsQuery('semafor', contents([notes]), 10)),
    ).rejects.toBe(bug);
  });
});
