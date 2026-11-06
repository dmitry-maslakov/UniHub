import { PluginName } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import { CHUNK_CHARS, HIGHLIGHT } from './chunks.js';
import { POST_TEXT_VERSION } from './post-text.js';
import {
  fileEntry,
  fileKey,
  manifestOf,
  postEntry,
  postKey,
  treeEntry,
  treeKey,
} from './records.js';
import type { Unpacking } from './unpacking.js';

const updatedAt = new Date('2026-10-01T09:00:00Z');
const lecture = sha256('%PDF lecture');

describe('records', () => {
  // catalog writes an item only when it changed; reading its raw for the
  // reconcile would take every post's whole
  it('keys a post by when catalog last changed it, and by the version of the rule its text is made by', () => {
    expect(postKey('post-1', { updatedAt })).toEqual({
      kind: 'post',
      id: 'post-1',
      fingerprint: `${POST_TEXT_VERSION}__2026-10-01T09:00:00.000Z`,
    });
    expect(postEntry('post-1', { updatedAt }, 'Exam').key).toEqual(
      postKey('post-1', { updatedAt }),
    );
  });

  // a hit of its own each, so posts of the same text in several courses
  // are found apart, and an edit's chunks go with the ones they replace
  it("cuts a post's text into chunks, each by a hash of the post's own", () => {
    const text = 'semafor '.repeat(CHUNK_CHARS / 4);
    const { chunks } = postEntry('post-1', { updatedAt }, text);

    expect(chunks).toHaveLength(2);
    expect(new Set(chunks.map(({ hash }) => hash))).toEqual(
      new Set([sha256('post:post-1')]),
    );
    expect(postEntry('post-2', { updatedAt }, text).chunks[0].hash).toBe(
      sha256('post:post-2'),
    );
    expect(postEntry('post-1', { updatedAt }, '').chunks).toEqual([]);
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

  // what it was made from may change while its chunks don't: then nothing
  // is written but the fingerprint, nothing embedded
  it('digests the chunks alone in its manifest, a change to any of their fields another digest', () => {
    const entry = postEntry('post-1', { updatedAt }, 'Exam');
    const { digest } = manifestOf(entry);

    expect(manifestOf(entry)).toEqual({ ...entry.key, digest });
    expect(
      manifestOf(postEntry('post-1', { updatedAt: new Date() }, 'Exam')).digest,
    ).toBe(digest);
    expect(
      manifestOf(postEntry('post-1', { updatedAt }, 'Exam!')).digest,
    ).not.toBe(digest);
    const file = fileEntry('file-1', { name: 'l5.pdf', hash: lecture });
    expect(
      manifestOf(fileEntry('file-1', { name: 'l5.pdf', hash: sha256('x') }))
        .digest,
    ).not.toBe(manifestOf(file).digest);
    const [chunk] = file.chunks;
    expect(
      manifestOf({ ...file, chunks: [{ ...chunk, member: 'l5.pdf' }] }).digest,
    ).not.toBe(manifestOf(file).digest);
  });
});
