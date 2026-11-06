import { Inject, Injectable } from '@nestjs/common';
import {
  fileEntry,
  postEntry,
  treeEntry,
  type RecordRef,
} from '../domain/records.js';
import { UnpackingRepository } from '../domain/unpacking.js';
import { embedded } from './index-text.js';
import { Embedder, FileFacts, PostFacts, TextIndex } from './ports.js';

// Puts a record into the search index as it is now, or takes it out once
// it's gone: a post removed, a file removed or without content, a content
// without a tree. Whichever change a job was queued for, what's there when
// it runs is indexed, so one queued twice is harmless. A post's chunks go
// in with their vectors when there's an embedder; names are found by their
// words alone, they aren't prose.
@Injectable()
export class IndexRecord {
  constructor(
    private readonly posts: PostFacts,
    private readonly files: FileFacts,
    private readonly unpackings: UnpackingRepository,
    private readonly index: TextIndex,
    // none for BM25 only
    @Inject(Embedder) private readonly embedder: Embedder | null,
  ) {}

  async run(ref: RecordRef, signal?: AbortSignal) {
    const entry = await this.entryOf(ref);
    if (!entry) return this.index.removeRecord(ref);
    const { key, chunks } = entry;
    await this.index.putRecord(
      key,
      key.kind === 'post'
        ? await embedded(this.embedder, chunks, signal)
        : chunks,
    );
  }

  private async entryOf(ref: RecordRef) {
    switch (ref.kind) {
      case 'post': {
        const post = await this.posts.post(ref.id);
        return post && postEntry(ref.id, post);
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
