import { PluginName, type ContentHash } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import { SearchOffError, SearchUnavailableError } from './errors.js';
import { TextIndexUnavailableError } from './ports.js';
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

function searching(...hits: TextHit[]) {
  const index = new InMemoryTextIndex();
  index.hits = hits;
  return { index, search: new SearchTexts(index) };
}

describe('SearchTexts', () => {
  it('answers none among no contents, without asking the index', async () => {
    const { index, search } = searching(hit(lecture, 1));

    expect(
      await search.execute(new SearchTextsQuery('semafor', [], 10)),
    ).toEqual([]);
    expect(index.searched).toEqual([]);
  });

  it('asks the index for that many among the contents given, the words NFC', async () => {
    const { index, search } = searching();
    const hashes = [lecture, notes];

    await search.execute(new SearchTextsQuery('C\u030Cac\u030Cak', hashes, 5));

    expect(index.searched).toEqual([{ text: 'Čačak', hashes, size: 5 }]);
    expect(index.searched[0].hashes).toBe(hashes);
  });

  it('answers the contents as the index found them', async () => {
    const hits = [hit(notes, 4), hit(lecture, 3, 1)];
    const { search } = searching(...hits);

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
