import { PluginName } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import { keyId, type RepresentationKey } from '../domain/representation.js';
import {
  FakeTextIndexQueue,
  InMemoryRepresentations,
  InMemoryTextIndex,
} from './processing.fakes.js';
import { ReconcileIndex } from './reconcile-index.js';

const processor = PluginName.parse('office-text');
const key = (content: string, version = 1): RepresentationKey => ({
  hash: sha256(content),
  processor,
  version,
});

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
  const queued = await new ReconcileIndex(index, representations, queue).run();
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

  it('queues nothing when they agree', async () => {
    const { queue, queued } = await reconciling([key('a')], [key('a')]);

    expect(queue.requeued).toEqual([]);
    expect(queued).toBe(0);
  });
});
