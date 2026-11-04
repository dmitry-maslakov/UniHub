import { PluginName } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import { chunksOf } from '../domain/chunks.js';
import type { Representation } from '../domain/representation.js';
import { IndexText } from './index-text.js';
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

async function indexing(...saved: Representation[]) {
  const representations = new InMemoryRepresentations();
  for (const representation of saved)
    await representations.save(representation);
  const index = new InMemoryTextIndex();
  return { index, indexText: new IndexText(representations, index) };
}

describe('IndexText', () => {
  it('indexes the newest version, cut into chunks', async () => {
    const { index, indexText } = await indexing(
      text(1, ['old']),
      text(2, ['page one', 'page two']),
    );

    await indexText.run({ hash, processor, version: 2 });

    expect([...index.texts.values()]).toEqual([
      {
        key: { hash, processor, version: 2 },
        chunks: chunksOf(['page one', 'page two']),
      },
    ]);
  });

  it('indexes the newest version for a job of an older one', async () => {
    const { index, indexText } = await indexing(
      text(1, ['old']),
      text(2, ['new']),
    );

    await indexText.run({ hash, processor, version: 1 });

    expect([...index.texts.values()].map(({ key }) => key.version)).toEqual([
      2,
    ]);
  });

  it('indexes a text without parts as one without chunks', async () => {
    const { index, indexText } = await indexing(text(1, []));

    await indexText.run({ hash, processor, version: 1 });

    expect([...index.texts.values()]).toEqual([
      { key: { hash, processor, version: 1 }, chunks: [] },
    ]);
  });

  it('takes out a newer version postgres no longer has', async () => {
    const { index, indexText } = await indexing(text(1, ['restored']));
    await index.put({ hash, processor, version: 2 }, chunksOf(['lost']));

    await indexText.run({ hash, processor, version: 2 });

    expect([...index.texts.values()]).toEqual([
      { key: { hash, processor, version: 1 }, chunks: chunksOf(['restored']) },
    ]);
  });

  it('takes out a text postgres no longer has', async () => {
    const { index, indexText } = await indexing();
    await index.put({ hash, processor, version: 1 }, chunksOf(['gone']));

    await indexText.run({ hash, processor, version: 1 });

    expect(index.texts.size).toBe(0);
  });
});
