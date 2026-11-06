import { Logger } from '@nestjs/common';
import { PluginName, type ContentHash } from '@app/kernel';
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
import { ContentMembers } from './content-members.js';
import {
  InMemoryExpansions,
  InMemoryRepresentations,
  InMemoryTextIndex,
  InMemoryTextReads,
} from './processing.fakes.js';
import { SearchTextsQuery, type TextHit } from './queries.js';
import { SearchTexts } from './search-texts.js';

const lecture = sha256('%PDF lecture');
const notes = sha256('notes');

const hit = (hash: ContentHash, ...pages: number[]): TextHit => ({
  hash,
  pages: pages.map((page) => ({
    processor: PluginName.parse('office-text'),
    version: 2,
    page,
    snippet: { text: `page ${page}`, highlights: [[0, 4]] },
  })),
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
  return {
    index,
    search: new SearchTexts(
      new ContentMembers(new InMemoryExpansions()),
      new InMemoryTextReads(),
      index,
      embedder,
      reranker,
    ),
  };
}

describe('SearchTexts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('answers none among no contents, without asking the index', async () => {
    const embedder = new FakeEmbedder(4);
    const embed = vi.spyOn(embedder, 'embed');
    const { index, search } = searching([hit(lecture, 1)], { embedder });

    expect(
      await search.execute(new SearchTextsQuery('semafor', [], 10)),
    ).toEqual([]);
    expect(index.searched).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  it('asks the index for that many among the contents given, the words NFC', async () => {
    const { index, search } = searching();
    const hashes = [lecture, notes];

    await search.execute(new SearchTextsQuery('C\u030Cac\u030Cak', hashes, 5));

    expect(index.searched).toEqual([{ text: 'Čačak', hashes, size: 5 }]);
  });

  it('asks by the meaning too, of the words as NFC', async () => {
    const embedder = new FakeEmbedder(4);
    const embed = vi.spyOn(embedder, 'embed');
    const { index, search } = searching([], { embedder });

    await search.execute(new SearchTextsQuery('C\u030Cac\u030Cak', [notes], 5));

    expect(embed).toHaveBeenCalledWith(['Čačak']);
    expect(index.searched).toEqual([
      {
        text: 'Čačak',
        vector: (await embedder.embed(['Čačak']))[0],
        hashes: [notes],
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
      await search.execute(new SearchTextsQuery('semafor', [notes], 5)),
    ).toEqual(hits);
    expect(index.searched).toEqual([
      { text: 'semafor', hashes: [notes], size: 5 },
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

    await search.execute(new SearchTextsQuery('semafor', [notes], 5));

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
        new SearchTextsQuery('semafor', [lecture, notes], 10),
      ),
    ).toEqual(hits);
  });

  it('asks the index for as many as the reranker takes, and answers the limit', async () => {
    const hits = ['a', 'b', 'c'].map((text) => saying(text));
    const { index, search } = searching(hits, {
      reranker: new FakeReranker({ candidates: 3 }),
    });

    expect(
      await search.execute(new SearchTextsQuery('semafor', [notes], 2)),
    ).toHaveLength(2);
    await search.execute(new SearchTextsQuery('semafor', [notes], 5));

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
    const { search } = searching([one, all, tie, past], { reranker });

    expect(
      await search.execute(
        new SearchTextsQuery('semafor tajna lozinka', [notes], 10),
      ),
    ).toEqual([all, one, tie, past]);
    expect(scores).toHaveBeenCalledWith('semafor tajna lozinka', [
      'semafor',
      'semafor tajna lozinka',
      'o semaforima: semafor',
    ]);
  });

  it('asks the reranker of the words as NFC, and not about one content', async () => {
    const reranker = new FakeReranker();
    const scores = vi.spyOn(reranker, 'scores');
    const hits = [saying('Čačak'), saying('Cacak')];

    await searching(hits, { reranker }).search.execute(
      new SearchTextsQuery('Čačak', [notes], 5),
    );
    await searching(hits.slice(0, 1), { reranker }).search.execute(
      new SearchTextsQuery('Čačak', [notes], 5),
    );

    expect(scores.mock.calls).toEqual([['Čačak', ['Čačak', 'Cacak']]]);
  });

  it("answers in the index's order while the reranker is busy with another query", async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const reranker: Reranker = new FakeReranker();
    vi.spyOn(reranker, 'scores').mockResolvedValue(null);
    const hits = [saying('semafor'), saying('semafor tajna lozinka')];
    const { search } = searching(hits, { reranker });

    expect(
      await search.execute(
        new SearchTextsQuery('semafor tajna lozinka', [notes], 10),
      ),
    ).toEqual(hits);
    expect(warn).not.toHaveBeenCalled();
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
    const { search } = searching(hits, { reranker });
    const asked = () =>
      search.execute(
        new SearchTextsQuery('semafor tajna lozinka', [notes], 10),
      );

    expect(await asked()).toEqual(hits);
    expect(await asked()).toEqual(hits);
    expect(warn.mock.calls).toEqual([
      ["in the index's order: http://reranker/rerank: ECONNREFUSED"],
      ["in the index's order: The operation was aborted due to timeout"],
    ]);
    expect(error).not.toHaveBeenCalled();
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
    const { search } = searching(hits, { reranker });

    expect(
      await search.execute(
        new SearchTextsQuery('semafor tajna lozinka', [notes], 10),
      ),
    ).toEqual(hits);
    expect(error).toHaveBeenCalledWith(
      "in the index's order: http://reranker/rerank answered 424: not a reranker",
      expect.any(String),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('answers an index away or stuck as search being unavailable', async () => {
    const { index, search } = searching();
    const away = new TextIndexUnavailableError('connect ECONNREFUSED');
    vi.spyOn(index, 'search').mockRejectedValue(away);

    const failed = search.execute(new SearchTextsQuery('semafor', [notes], 10));

    await expect(failed).rejects.toBeInstanceOf(SearchUnavailableError);
    await expect(failed).rejects.toMatchObject({
      kind: 'unavailable',
      reason: 'SEARCH_UNAVAILABLE',
      message: 'search is unavailable, try again later',
      cause: away,
    });
  });

  it('answers search being off without an index, whatever it is asked', async () => {
    const search = new SearchTexts(
      new ContentMembers(new InMemoryExpansions()),
      new InMemoryTextReads(),
    );

    for (const hashes of [[notes], []]) {
      const failed = search.execute(
        new SearchTextsQuery('semafor', hashes, 10),
      );
      await expect(failed).rejects.toBeInstanceOf(SearchOffError);
      await expect(failed).rejects.toMatchObject({
        kind: 'unavailable',
        reason: 'SEARCH_OFF',
      });
    }
  });

  it('lets any other failure through as it came', async () => {
    const { index, search } = searching();
    const bug = new Error('the number of terms exceeded the allowed maximum');
    vi.spyOn(index, 'search').mockRejectedValue(bug);

    await expect(
      search.execute(new SearchTextsQuery('semafor', [notes], 10)),
    ).rejects.toBe(bug);
  });
});

describe('SearchTexts in archives', () => {
  const labs = sha256('labs.zip');
  const main = sha256('main.c');
  const slides = sha256('slides.pdf');
  const plain = PluginName.parse('plain-text');
  const office = PluginName.parse('office-text');

  const page = (
    processor: PluginName,
    number: number,
  ): TextHit['pages'][number] => ({
    processor,
    version: 1,
    page: number,
    snippet: { text: `page ${number}`, highlights: [] },
  });

  // labs.zip holds lab/main.c (plain-text, 2 pages) and slides.pdf
  // (office-text, 3 pages, and plain-text, 1)
  async function searchingIn(hits: TextHit[]) {
    const expansions = new InMemoryExpansions();
    await expansions.save({
      hash: labs,
      expander: PluginName.parse('archives'),
      version: 1,
      entries: [
        { path: 'lab/main.c', hash: main, size: 10 },
        { path: 'slides.pdf', hash: slides, size: 100 },
      ],
    });
    const representations = new InMemoryRepresentations();
    for (const [hash, processor, parts] of [
      [main, plain, ['a', 'b']],
      [slides, office, ['1', '2', '3']],
      [slides, plain, ['x']],
    ] as const)
      await representations.save({
        hash,
        processor,
        version: 1,
        parts: [...parts],
      });
    const index = new InMemoryTextIndex();
    index.hits = hits;
    const search = new SearchTexts(
      new ContentMembers(expansions),
      new InMemoryTextReads(representations),
      index,
    );
    return { index, search };
  }

  it("looks through an archive's entries too", async () => {
    const { index, search } = await searchingIn([]);

    await search.execute(new SearchTextsQuery('main', [labs], 5));

    expect(index.searched[0].hashes).toEqual([labs, main, slides]);
  });

  it("finds an entry as its archive, on the page of the archive's text, with the entry's path", async () => {
    const { search } = await searchingIn([
      { hash: slides, pages: [page(plain, 1), page(office, 2)] },
    ]);

    expect(await search.execute(new SearchTextsQuery('x', [labs], 5))).toEqual([
      {
        hash: labs,
        pages: [
          { ...page(plain, 1), page: 3, path: 'slides.pdf' },
          { ...page(office, 2), path: 'slides.pdf' },
        ],
      },
    ]);
  });

  it("puts an archive's entries together where the first came, at most 3 pages", async () => {
    const { search } = await searchingIn([
      { hash: main, pages: [page(plain, 2), page(plain, 1)] },
      hit(notes, 1),
      { hash: slides, pages: [page(office, 1), page(office, 3)] },
    ]);

    const found = await search.execute(
      new SearchTextsQuery('x', [labs, notes], 5),
    );

    expect(found.map(({ hash }) => hash)).toEqual([labs, notes]);
    expect(found[0].pages.map(({ path, page }) => [path, page])).toEqual([
      ['lab/main.c', 2],
      ['lab/main.c', 1],
      ['slides.pdf', 1],
    ]);
  });

  it('finds an entry asked for itself as itself', async () => {
    const { search } = await searchingIn([
      { hash: main, pages: [page(plain, 2)] },
    ]);

    expect(
      await search.execute(new SearchTextsQuery('x', [labs, main], 5)),
    ).toEqual([{ hash: main, pages: [page(plain, 2)] }]);
  });
});
