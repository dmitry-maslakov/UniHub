import { createHash } from 'node:crypto';
import { ContentHash, type Json } from '@app/kernel';
import { chunksOf } from './chunks.js';
import { POST_TEXT_VERSION } from './post-text.js';
import { kept, type Made, type Unpacking } from './unpacking.js';

// What the search index keeps besides the processors' texts, each under
// the id of what it's of: a post's text (an item), a file's name, and the
// paths of the members an archive's tree kept (under its content's hash).
// A record's chunks go by a hash, as a text's do, so a search answers each
// hash once: a name or a path by the content it names, with that content's
// pages, and a post by one of its own, as no two posts are one.

// the item's or the file's id, the archive's content hash
export type RecordRef =
  { kind: 'post' | 'file'; id: string } | { kind: 'tree'; id: ContentHash };
export type RecordKind = RecordRef['kind'];

// and what it was made from, so the reconcile tells one that's out of date
export type RecordKey = RecordRef & { fingerprint: string };

// a chunk of the post, the file's name, a member's path
export interface RecordChunk {
  hash: ContentHash;
  text: string;
  // a tree's: the member's path
  member?: string;
}

export interface RecordEntry {
  key: RecordKey;
  chunks: RecordChunk[];
}

// What the index says of a record: its key, and a digest of its chunks, so
// one made again from something else but of the same chunks (a post edited
// past its text, a file moved) has only this written again, its chunks and
// their vectors kept
export type RecordManifest = RecordKey & { digest: string };

// the ref as one string, for ids
export const refId = ({ kind, id }: RecordRef) => `${kind}__${id}`;

const sha256 = (text: string) =>
  ContentHash.parse(createHash('sha256').update(text).digest('hex'));
const digest = (value: Json) => sha256(JSON.stringify(value));

export const manifestOf = ({ key, chunks }: RecordEntry): RecordManifest => ({
  ...key,
  digest: digest(
    chunks.map(({ hash, text, member }) => [hash, text, member ?? null]),
  ),
});

// a post changes when catalog writes it, and with the rule its text is made
// by (POST_TEXT_VERSION)
export const postKey = (
  id: string,
  { updatedAt }: { updatedAt: Date },
): RecordKey => ({
  kind: 'post',
  id,
  fingerprint: `${POST_TEXT_VERSION}__${updatedAt.toISOString()}`,
});

// its text (post-text.ts) in chunks, by a hash of the post's own
export const postEntry = (
  id: string,
  post: { updatedAt: Date },
  text: string,
): RecordEntry => {
  const hash = sha256(`post:${id}`);
  return {
    key: postKey(id, post),
    chunks: chunksOf([text]).map(({ text }) => ({ hash, text })),
  };
};

// a file that holds content, by its name; one without isn't searched
export interface NamedFile {
  name: string;
  hash: ContentHash;
}

export const fileKey = (id: string, { name, hash }: NamedFile): RecordKey => ({
  kind: 'file',
  id,
  fingerprint: digest([name, hash]),
});

export const fileEntry = (id: string, file: NamedFile): RecordEntry => ({
  key: fileKey(id, file),
  chunks: chunksOf([file.name]).map(({ text }) => ({ hash: file.hash, text })),
});

// a tree is made again only for another unpacker version or policy
export const treeKey = ({
  hash,
  unpacker,
  version,
  policy,
}: Made): RecordKey => ({
  kind: 'tree',
  id: hash,
  fingerprint: `${unpacker}__${version}__${policy}`,
});

// the members kept, by their paths: one listed but not kept can't be read
export const treeEntry = (tree: Unpacking): RecordEntry => ({
  key: treeKey(tree),
  chunks: kept(tree.members).flatMap(({ path, hash }) =>
    chunksOf([path]).map(({ text }) => ({ hash, text, member: path })),
  ),
});
