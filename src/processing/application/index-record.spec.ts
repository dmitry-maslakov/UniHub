import { PluginName } from '@app/kernel';
import { FakeEmbedder } from '../../../test/fake-models.js';
import { sha256 } from '../../../test/sha256.js';
import {
  fileEntry,
  postEntry,
  refId,
  treeEntry,
  type RecordRef,
} from '../domain/records.js';
import type { Unpacking } from '../domain/unpacking.js';
import { IndexRecord } from './index-record.js';
import type { Embedder, FileFacts } from './ports.js';
import {
  FakeFiles,
  FakePosts,
  InMemoryTextIndex,
  InMemoryUnpackings,
} from './processing.fakes.js';

const post = { title: 'Exam', raw: { message: '<p>on Monday</p>' } };
const lecture = sha256('%PDF lecture');
const file = { name: 'l5.pdf', mime: null, hash: lecture };
const tree: Unpacking = {
  hash: sha256('labs.zip'),
  unpacker: PluginName.parse('archives'),
  version: 1,
  policy: 1,
  members: [
    {
      path: 'main.c',
      hash: sha256('int main'),
      size: null,
      mime: null,
      leftOut: null,
    },
  ],
  cutShort: null,
};
const refs = {
  post: { kind: 'post', id: 'post-1' },
  file: { kind: 'file', id: 'file-1' },
  tree: { kind: 'tree', id: tree.hash },
} satisfies Record<string, RecordRef>;

// catalog has the post and the file, processing the tree, unless told
// otherwise; BM25 only unless an embedder is given
async function indexing({
  embedder = null,
  posts = new FakePosts(new Map([['post-1', post]])),
  files = new FakeFiles(new Map([['file-1', file]])),
}: { embedder?: Embedder | null; posts?: FakePosts; files?: FakeFiles } = {}) {
  const unpackings = new InMemoryUnpackings();
  await unpackings.save(tree);
  const index = new InMemoryTextIndex();
  return {
    index,
    files,
    indexRecord: new IndexRecord(posts, files, unpackings, index, embedder),
  };
}

describe('IndexRecord', () => {
  it('indexes a post, a file and a tree as they are now', async () => {
    const { index, indexRecord } = await indexing();

    for (const ref of Object.values(refs)) await indexRecord.run(ref);

    expect([...index.records.values()]).toEqual([
      await postEntry('post-1', post),
      fileEntry('file-1', file),
      treeEntry(tree),
    ]);
  });

  // gone from catalog, or never there: removed, or of a deleted record
  it('takes out a post or a file catalog no longer has, and a tree there is none of', async () => {
    const { index, indexRecord } = await indexing({
      posts: new FakePosts(),
      files: new FakeFiles(),
    });
    for (const ref of Object.values(refs))
      index.records.set(refId(ref), {
        key: { ...ref, fingerprint: 'before' },
        chunks: [],
      });

    await indexRecord.run(refs.post);
    await indexRecord.run(refs.file);
    await indexRecord.run({ kind: 'tree', id: sha256('gone.zip') });

    expect([...index.records.keys()]).toEqual([refId(refs.tree)]);
    expect(index.calls).toEqual([
      'removeRecord',
      'removeRecord',
      'removeRecord',
    ]);
  });

  it('takes out the name of a file without content', async () => {
    const { index, indexRecord, files } = await indexing();
    vi.spyOn(files as FileFacts, 'file').mockResolvedValue({
      ...file,
      hash: null,
    });

    await indexRecord.run(refs.file);

    expect(index.calls).toEqual(['removeRecord']);
  });

  it("embeds a post's chunks, with the job's signal, but no name or path", async () => {
    const embedder = new FakeEmbedder(4);
    const embed = vi.spyOn(embedder, 'embed');
    const { index, indexRecord } = await indexing({ embedder });
    const { signal } = new AbortController();

    for (const ref of Object.values(refs)) await indexRecord.run(ref, signal);

    const { chunks } = await postEntry('post-1', post);
    expect(embed.mock.calls).toEqual([
      [chunks.map(({ text }) => text), signal],
    ]);
    expect(index.records.get(refId(refs.post))!.chunks).toEqual(
      await Promise.all(
        chunks.map(async (chunk) => ({
          ...chunk,
          vector: (await embedder.embed([chunk.text]))[0],
        })),
      ),
    );
    expect(index.records.get(refId(refs.file))!.chunks).toEqual(
      fileEntry('file-1', file).chunks,
    );
  });
});
