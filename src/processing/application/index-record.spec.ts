import { PluginName } from '@app/kernel';
import { FakeEmbedder } from '../../../test/fake-models.js';
import { sha256 } from '../../../test/sha256.js';
import { postStrings, postText } from '../domain/post-text.js';
import {
  fileEntry,
  manifestOf,
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
  PlainHtmlText,
} from './processing.fakes.js';

const updatedAt = new Date('2026-10-01T09:00:00Z');
const post = {
  title: 'Exam',
  raw: { message: 'on Monday', url: 'https://portal.example/p1' },
  updatedAt,
};
// as PlainHtmlText reads it
const text = postText(postStrings(post));
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
  const html = new PlainHtmlText();
  return {
    index,
    posts,
    files,
    html,
    indexRecord: new IndexRecord(
      posts,
      files,
      unpackings,
      html,
      index,
      embedder,
    ),
  };
}

const indexed = (entry: ReturnType<typeof fileEntry>) => ({
  manifest: manifestOf(entry),
  chunks: entry.chunks,
});

describe('IndexRecord', () => {
  it("indexes a post, a file and a tree as they are now, a post's strings read as HTML", async () => {
    const { index, indexRecord, html } = await indexing();

    for (const ref of Object.values(refs)) await indexRecord.run(ref);

    expect([...index.records.values()]).toEqual([
      indexed(postEntry('post-1', post, text)),
      indexed(fileEntry('file-1', file)),
      indexed(treeEntry(tree)),
    ]);
    expect(html.read).toEqual([postStrings(post)]);
  });

  // gone from catalog, or never there: removed, or of a deleted record
  it('takes out a post or a file catalog no longer has, and a tree there is none of', async () => {
    const { index, indexRecord } = await indexing({
      posts: new FakePosts(),
      files: new FakeFiles(),
    });
    for (const ref of Object.values(refs))
      index.records.set(refId(ref), {
        manifest: { ...ref, fingerprint: 'before', digest: 'd' },
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

    const { chunks } = postEntry('post-1', post, text);
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

  // its link changed, its text didn't
  it('writes only the fingerprint of a post changed past its text, embedding nothing, and nothing of one not changed', async () => {
    const embedder = new FakeEmbedder(4);
    const { index, indexRecord, posts } = await indexing({ embedder });
    await indexRecord.run(refs.post);
    const embed = vi.spyOn(embedder, 'embed');
    const later = new Date('2026-10-02T09:00:00Z');
    posts.saved.set('post-1', {
      ...post,
      raw: { ...post.raw, url: 'https://portal.example/p1?v=2' },
      updatedAt: later,
    });
    index.calls.length = 0;

    await indexRecord.run(refs.post);
    await indexRecord.run(refs.post);

    expect(embed).not.toHaveBeenCalled();
    expect(index.calls).toEqual(['putRecordFingerprint']);
    expect(index.records.get(refId(refs.post))!.manifest).toEqual(
      manifestOf(postEntry('post-1', { updatedAt: later }, text)),
    );
  });

  it('writes a post whose text changed whole again, embedded', async () => {
    const embedder = new FakeEmbedder(4);
    const { index, indexRecord, posts } = await indexing({ embedder });
    await indexRecord.run(refs.post);
    const embed = vi.spyOn(embedder, 'embed');
    posts.saved.set('post-1', { ...post, title: 'Exam moved' });

    await indexRecord.run(refs.post);

    expect(embed).toHaveBeenCalledTimes(1);
    expect(index.calls.at(-1)).toBe('putRecord');
  });
});
