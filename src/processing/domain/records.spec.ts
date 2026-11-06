import { createHash } from 'node:crypto';
import { PluginName } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import { CHUNK_CHARS, HIGHLIGHT } from './chunks.js';
import {
  fileEntry,
  fileKey,
  postEntry,
  postKey,
  treeEntry,
  treeKey,
} from './records.js';
import type { Unpacking } from './unpacking.js';

const post = { title: 'Exam', raw: { message: '<p>on Monday</p>' } };
const lecture = sha256('%PDF lecture');

describe('records', () => {
  it("keys a post by what its text is made from, so an edit is another fingerprint, the same post another's", async () => {
    const key = postKey('post-1', post);

    expect(key).toMatchObject({ kind: 'post', id: 'post-1' });
    expect(postKey('post-1', { ...post })).toEqual(key);
    expect(postKey('post-1', { ...post, title: 'Exam!' })).not.toEqual(key);
    expect(postKey('post-1', { ...post, raw: {} })).not.toEqual(key);
    expect((await postEntry('post-1', post)).key).toEqual(key);
  });

  // a search answers chunks by their hash: a post's text is the content
  // its chunks are of
  it("cuts a post's text into chunks, each by the hash of the whole text", async () => {
    const long = { title: null, raw: 'semafor '.repeat(CHUNK_CHARS / 4) };
    const text = 'Exam\n\non Monday';

    expect((await postEntry('post-1', post)).chunks).toEqual([
      { hash: createHash('sha256').update(text).digest('hex'), text },
    ]);
    const { chunks } = await postEntry('post-2', long);
    expect(chunks).toHaveLength(2);
    expect(new Set(chunks.map(({ hash }) => hash)).size).toBe(1);
  });

  it('is no chunk of a post without words', async () => {
    expect(
      (await postEntry('post-1', { title: null, raw: {} })).chunks,
    ).toEqual([]);
  });

  // a file's name is found as the content it holds, which a new one changes
  it('keys a file by its name and content, its one chunk its name by that content, as indexed', () => {
    const file = { name: `l5${HIGHLIGHT.open}.pdf`, hash: lecture };

    expect(fileEntry('file-1', file)).toEqual({
      key: fileKey('file-1', file),
      chunks: [{ hash: lecture, text: 'l5�.pdf' }],
    });
    expect(fileKey('file-1', { ...file, name: 'l6.pdf' })).not.toEqual(
      fileKey('file-1', file),
    );
    expect(
      fileKey('file-1', { ...file, hash: sha256('%PDF other') }),
    ).not.toEqual(fileKey('file-1', file));
  });

  it("keys a tree by its content and what made it, its chunks the kept members' paths by their contents", () => {
    const tree: Unpacking = {
      hash: sha256('labs.zip'),
      unpacker: PluginName.parse('archives'),
      version: 2,
      policy: 1,
      members: [
        {
          path: 'lab1/main.c',
          hash: sha256('int main'),
          size: 8,
          mime: null,
          leftOut: null,
        },
        {
          path: 'big.bin',
          hash: null,
          size: null,
          mime: null,
          leftOut: 'TOO_LARGE',
        },
      ],
      cutShort: null,
    };

    expect(treeEntry(tree)).toEqual({
      key: { kind: 'tree', id: tree.hash, fingerprint: 'archives__2__1' },
      chunks: [
        {
          hash: sha256('int main'),
          text: 'lab1/main.c',
          member: 'lab1/main.c',
        },
      ],
    });
    expect(treeKey({ ...tree, policy: 2 }).fingerprint).toBe('archives__2__2');
  });
});
