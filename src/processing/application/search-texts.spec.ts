import { PluginName, type ContentHash } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import { SearchUnavailableError } from './errors.js';
import type { ContentHit, PageHit } from './ports.js';
import { TextIndexUnavailableError } from './ports.js';
import { InMemoryTextIndex } from './processing.fakes.js';
import { SearchTextsQuery } from './queries.js';
import { SearchTexts } from './search-texts.js';

const lecture = sha256('%PDF lecture');
const notes = sha256('notes');
const officeText = PluginName.parse('office-text');
const plainText = PluginName.parse('plain-text');

const page = (page: number, chunk = 0, processor = officeText): PageHit => ({
  processor,
  version: 2,
  page,
  chunk,
  snippet: { text: `page ${page}, chunk ${chunk}`, highlights: [[0, 4]] },
});
const hit = (hash: ContentHash, ...pages: PageHit[]): ContentHit => ({
  hash,
  score: 1,
  pages,
});

function searching(...hits: ContentHit[]) {
  const index = new InMemoryTextIndex();
  index.hits = hits;
  return { index, search: new SearchTexts(index) };
}

describe('SearchTexts', () => {
  it('answers none among no contents, without asking the index', async () => {
    const { index, search } = searching(hit(lecture, page(1)));

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

  it('answers the contents in the index order, each page once by its best chunk', async () => {
    const { search } = searching(
      hit(notes, page(4)),
      hit(lecture, page(3, 1), page(1), page(3, 0), page(3, 0, plainText)),
    );

    const found = await search.execute(
      new SearchTextsQuery('semafor', [lecture, notes], 10),
    );

    // as the index has them, but for the chunk
    const shown = ({ processor, version, page, snippet }: PageHit) => ({
      processor,
      version,
      page,
      snippet,
    });
    expect(found).toEqual([
      { hash: notes, pages: [shown(page(4))] },
      {
        hash: lecture,
        pages: [page(3, 1), page(1), page(3, 0, plainText)].map(shown),
      },
    ]);
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

  it('lets any other failure through as it came', async () => {
    const { index, search } = searching();
    const bug = new Error('the number of terms exceeded the allowed maximum');
    vi.spyOn(index, 'search').mockRejectedValue(bug);

    await expect(
      search.execute(new SearchTextsQuery('semafor', [notes], 10)),
    ).rejects.toBe(bug);
  });
});
