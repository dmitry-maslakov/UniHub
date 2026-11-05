import { PluginName } from '@app/kernel';
import { FakeEmbedder } from '../../../test/fake-models.js';
import { sha256 } from '../../../test/sha256.js';
import { chunksOf } from '../domain/chunks.js';
import type { Representation } from '../domain/representation.js';
import { IndexText } from './index-text.js';
import type { Embedder } from './ports.js';
import {
  InMemoryRepresentations,
  InMemoryTextIndex,
} from './processing.fakes.js';

const hash = sha256('%PDF lecture');
const processor = PluginName.parse('office-text');
const text = (version: number, parts: string[]): Representation => ({
  hash,
  processor,
  version,
  parts,
});

// BM25 only unless an embedder is given
async function indexing(
  saved: Representation[],
  embedder: Embedder | null = null,
) {
  const representations = new InMemoryRepresentations();
  for (const representation of saved)
    await representations.save(representation);
  const index = new InMemoryTextIndex();
  return { index, indexText: new IndexText(representations, index, embedder) };
}

describe('IndexText', () => {
  it('indexes the newest version, cut into chunks', async () => {
    const { index, indexText } = await indexing([
      text(1, ['old']),
      text(2, ['page one', 'page two']),
    ]);

    await indexText.run({ hash, processor, version: 2 });

    expect([...index.texts.values()]).toEqual([
      {
        key: { hash, processor, version: 2 },
        chunks: chunksOf(['page one', 'page two']),
      },
    ]);
  });

  it('indexes the newest version for a job of an older one', async () => {
    const { index, indexText } = await indexing([
      text(1, ['old']),
      text(2, ['new']),
    ]);

    await indexText.run({ hash, processor, version: 1 });

    expect([...index.texts.values()].map(({ key }) => key.version)).toEqual([
      2,
    ]);
  });

  it('indexes a text without parts as one without chunks', async () => {
    const { index, indexText } = await indexing([text(1, [])]);

    await indexText.run({ hash, processor, version: 1 });

    expect([...index.texts.values()]).toEqual([
      { key: { hash, processor, version: 1 }, chunks: [] },
    ]);
  });

  it('takes out a newer version postgres no longer has', async () => {
    const { index, indexText } = await indexing([text(1, ['restored'])]);
    await index.put({ hash, processor, version: 2 }, chunksOf(['lost']));

    await indexText.run({ hash, processor, version: 2 });

    expect([...index.texts.values()]).toEqual([
      { key: { hash, processor, version: 1 }, chunks: chunksOf(['restored']) },
    ]);
  });

  it('takes out a text postgres no longer has', async () => {
    const { index, indexText } = await indexing([]);
    await index.put({ hash, processor, version: 1 }, chunksOf(['gone']));

    await indexText.run({ hash, processor, version: 1 });

    expect(index.texts.size).toBe(0);
  });

  it("embeds the chunks in one call, the job's signal with it, each indexed with its vector", async () => {
    const embedder = new FakeEmbedder(4);
    const embed = vi.spyOn(embedder, 'embed');
    const parts = Array.from({ length: 19 }, (_, i) => `page ${i + 1}`);
    const { index, indexText } = await indexing([text(1, parts)], embedder);
    const { signal } = new AbortController();

    await indexText.run({ hash, processor, version: 1 }, signal);

    expect(embed.mock.calls).toEqual([
      [chunksOf(parts).map(({ text }) => text), signal],
    ]);
    const [{ chunks }] = index.texts.values();
    expect(chunks).toEqual(
      await Promise.all(
        chunksOf(parts).map(async (chunk) => ({
          ...chunk,
          vector: (await embedder.embed([chunk.text]))[0],
        })),
      ),
    );
  });

  it('embeds nothing of a text without parts', async () => {
    const embedder = new FakeEmbedder(4);
    const embed = vi.spyOn(embedder, 'embed');
    const { index, indexText } = await indexing([text(1, [])], embedder);

    await indexText.run({ hash, processor, version: 1 });

    expect(embed).not.toHaveBeenCalled();
    expect([...index.texts.values()][0].chunks).toEqual([]);
  });

  it('indexes nothing when the embed fails or is stopped, the text there as it was', async () => {
    const embedder = new FakeEmbedder(4);
    const away = new Error('the embedder is away');
    vi.spyOn(embedder, 'embed').mockRejectedValueOnce(away);
    const { index, indexText } = await indexing(
      [text(2, ['page 1', 'page 2'])],
      embedder,
    );
    await index.put({ hash, processor, version: 1 }, chunksOf(['before']));

    await expect(indexText.run({ hash, processor, version: 2 })).rejects.toBe(
      away,
    );
    expect([...index.texts.values()].map(({ key }) => key.version)).toEqual([
      1,
    ]);
  });
});
