import { PluginName } from '@app/kernel';
import { catalogOf, processor } from '../../../test/discovered-plugins.js';
import { sha256 } from '../../../test/sha256.js';
import { keyId, type RepresentationKey } from '../domain/representation.js';
import {
  FakeTextIndexQueue,
  InMemoryRepresentations,
  InMemoryTextIndex,
} from './processing.fakes.js';
import { ReconcileIndex } from './reconcile-index.js';

// office-text is on, zz-off isn't
const plugins = catalogOf({ processors: [processor('office-text', ['.pdf'])] });
const off = PluginName.parse('zz-off');
const key = (
  content: string,
  version = 1,
  by = PluginName.parse('office-text'),
): RepresentationKey => ({ hash: sha256(content), processor: by, version });

// postgres holds these keys, the index those
async function reconciling(
  saved: RepresentationKey[],
  indexed: RepresentationKey[],
) {
  const representations = new InMemoryRepresentations();
  for (const k of saved) await representations.save({ ...k, parts: [] });
  const index = new InMemoryTextIndex();
  for (const k of indexed) index.texts.set(keyId(k), { key: k, chunks: [] });
  const queue = new FakeTextIndexQueue();
  const queued = await new ReconcileIndex(
    index,
    representations,
    queue,
    plugins,
  ).run();
  return { index, queue, queued };
}

describe('ReconcileIndex', () => {
  it('makes sure the index is there before reading it', async () => {
    const { index } = await reconciling([], []);

    expect(index.calls).toEqual(['ensure', 'keys']);
  });

  it('queues the newest texts the index lacks', async () => {
    const { queue, queued } = await reconciling(
      [key('a'), key('b'), key('b', 2)],
      [key('a')],
    );

    expect(queue.requeued).toEqual([key('b', 2)]);
    expect(queued).toBe(1);
  });

  it('queues what the index holds that is no longer newest, or no longer there', async () => {
    const { queue, queued } = await reconciling(
      [key('a'), key('a', 2)],
      [key('a'), key('gone')],
    );

    expect(queue.requeued).toEqual([key('a', 2), key('a'), key('gone')]);
    expect(queued).toBe(3);
  });

  // no search finds them: those indexed stay, found again once it's back
  // on, and those missing wait for it
  it('queues none of the texts of a processor that is off, and leaves those indexed as they are', async () => {
    const { queue, queued } = await reconciling(
      [key('a', 1, off), key('b', 1, off)],
      [key('a', 1, off)],
    );

    expect(queue.requeued).toEqual([]);
    expect(queued).toBe(0);
  });

  it('queues nothing when they agree', async () => {
    const { queue, queued } = await reconciling([key('a')], [key('a')]);

    expect(queue.requeued).toEqual([]);
    expect(queued).toBe(0);
  });
});
