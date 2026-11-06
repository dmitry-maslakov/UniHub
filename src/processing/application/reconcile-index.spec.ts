import { PluginName } from '@app/kernel';
import { catalogOf, processor } from '../../../test/discovered-plugins.js';
import { sha256 } from '../../../test/sha256.js';
import {
  fileKey,
  postKey,
  refId,
  treeKey,
  type RecordKey,
} from '../domain/records.js';
import { keyId, type RepresentationKey } from '../domain/representation.js';
import {
  FakeFiles,
  FakePosts,
  FakeTextIndexQueue,
  InMemoryRepresentations,
  InMemoryTextIndex,
  InMemoryUnpackings,
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

// a post, a file and a tree in postgres
const post = {
  title: 'Exam',
  raw: { body: '<p>on Monday</p>' },
  updatedAt: new Date('2026-10-01T09:00:00Z'),
};
const file = { name: 'l5.pdf', hash: sha256('%PDF l5'), mime: null };
const tree = {
  hash: sha256('labs.zip'),
  unpacker: PluginName.parse('archives'),
  version: 1,
  policy: 1,
  members: [],
  cutShort: null,
};
const records = [
  postKey('post-1', post),
  fileKey('file-1', file),
  treeKey(tree),
];

// postgres holds these keys and the records above, the index those
async function reconciling(
  saved: RepresentationKey[],
  indexed: RepresentationKey[],
  indexedRecords: RecordKey[] = records,
) {
  const representations = new InMemoryRepresentations();
  for (const k of saved) await representations.save({ ...k, parts: [] });
  const index = new InMemoryTextIndex();
  for (const k of indexed) index.texts.set(keyId(k), { key: k, chunks: [] });
  for (const k of indexedRecords)
    index.records.set(refId(k), {
      manifest: { ...k, digest: 'd' },
      chunks: [],
    });
  const unpackings = new InMemoryUnpackings();
  await unpackings.save(tree);
  const queue = new FakeTextIndexQueue();
  const queued = await new ReconcileIndex(
    index,
    representations,
    queue,
    plugins,
    new FakePosts(new Map([['post-1', post]])),
    new FakeFiles(new Map([['file-1', file]])),
    unpackings,
  ).run();
  return { index, queue, queued };
}

describe('ReconcileIndex', () => {
  it('makes sure the index is there before reading it', async () => {
    const { index } = await reconciling([], []);

    expect(index.calls).toEqual(['ensure', 'keys', 'recordKeys']);
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

  it('queues the posts, files and trees the index lacks', async () => {
    const { queue, queued } = await reconciling([], [], [records[1]]);

    expect(queue.requeuedRecords).toEqual([records[0], records[2]]);
    expect(queued).toBe(2);
  });

  // a post edited, a file renamed or given new content, a tree made anew
  it('queues the records the index holds made from something else', async () => {
    const { queue, queued } = await reconciling(
      [],
      [],
      records.map((key) => ({ ...key, fingerprint: 'before' })),
    );

    expect(queue.requeuedRecords).toEqual(records);
    expect(queued).toBe(3);
  });

  it('queues the records the index holds of nothing postgres has, for their jobs to take out', async () => {
    const gone: RecordKey = { kind: 'post', id: 'gone', fingerprint: 'x' };
    const { queue, queued } = await reconciling([], [], [...records, gone]);

    expect(queue.requeuedRecords).toEqual([gone]);
    expect(queued).toBe(1);
  });
});
