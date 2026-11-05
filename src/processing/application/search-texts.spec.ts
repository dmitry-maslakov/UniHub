import { Logger } from '@nestjs/common';
import { PluginName, type ContentHash } from '@app/kernel';
import { FakeEmbedder } from '../../../test/fake-models.js';
import { sha256 } from '../../../test/sha256.js';
import { SearchOffError, SearchUnavailableError } from './errors.js';
import {
  EmbedderUnavailableError,
  TextIndexUnavailableError,
  type QueryEmbedder,
} from './ports.js';
import { InMemoryTextIndex } from './processing.fakes.js';
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

// by the words alone unless there's an embedder
function searching(hits: TextHit[] = [], embedder?: QueryEmbedder) {
  const index = new InMemoryTextIndex();
  index.hits = hits;
  return { index, search: new SearchTexts(index, embedder) };
}

describe('SearchTexts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('answers none among no contents, without asking the index', async () => {
    const embedder = new FakeEmbedder(4);
    const embed = vi.spyOn(embedder, 'embed');
    const { index, search } = searching([hit(lecture, 1)], embedder);

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
    expect(index.searched[0].hashes).toBe(hashes);
  });

  it('asks by the meaning too, of the words as NFC', async () => {
    const embedder = new FakeEmbedder(4);
    const embed = vi.spyOn(embedder, 'embed');
    const { index, search } = searching([], embedder);

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
    const { index, search } = searching(hits, embedder);

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
    const { index, search } = searching([], embedder);

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
    const search = new SearchTexts();

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
