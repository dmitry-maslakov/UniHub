import { Inject, Injectable } from '@nestjs/common';
import { postStrings, postText } from '../domain/post-text.js';
import {
  fileEntry,
  manifestOf,
  postEntry,
  treeEntry,
  type RecordRef,
} from '../domain/records.js';
import { UnpackingRepository } from '../domain/unpacking.js';
import { embedded } from './index-text.js';
import {
  Embedder,
  FileFacts,
  HtmlText,
  PostFacts,
  TextIndex,
} from './ports.js';

// Puts a record into the search index as it is now, or takes it out once
// it's gone: a post removed, a file removed or without content, a content
// without a tree. Whichever change a job was queued for, what's there when
// it runs is indexed, so one queued twice is harmless. A record whose
// chunks come out as the index has them (a post edited past its text, a
// file moved) gets its fingerprint alone written again, nothing embedded. A
// post's chunks go in with their vectors when there's an embedder; names
// are found by their words alone, they aren't prose.
@Injectable()
export class IndexRecord {
  constructor(
    private readonly posts: PostFacts,
    private readonly files: FileFacts,
    private readonly unpackings: UnpackingRepository,
    private readonly html: HtmlText,
    private readonly index: TextIndex,
    // none for BM25 only
    @Inject(Embedder) private readonly embedder: Embedder | null,
  ) {}

  async run(ref: RecordRef, signal?: AbortSignal) {
    const entry = await this.entryOf(ref);
    if (!entry) return this.index.removeRecord(ref);
    const manifest = manifestOf(entry);
    const indexed = await this.index.recordManifest(ref);
    if (indexed?.digest === manifest.digest) {
      if (indexed.fingerprint !== manifest.fingerprint)
        await this.index.putRecordFingerprint(manifest);
      return;
    }
    await this.index.putRecord(
      manifest,
      ref.kind === 'post'
        ? await embedded(this.embedder, entry.chunks, signal)
        : entry.chunks,
    );
  }

  private async entryOf(ref: RecordRef) {
    switch (ref.kind) {
      case 'post': {
        const post = await this.posts.post(ref.id);
        if (!post) return null;
        const read = await this.html.textsOf(postStrings(post));
        return postEntry(ref.id, post, postText(read));
      }
      case 'file': {
        const file = await this.files.file(ref.id);
        return file?.hash
          ? fileEntry(ref.id, { name: file.name, hash: file.hash })
          : null;
      }
      case 'tree': {
        const tree = await this.unpackings.current(ref.id);
        return tree && treeEntry(tree);
      }
    }
  }
}
