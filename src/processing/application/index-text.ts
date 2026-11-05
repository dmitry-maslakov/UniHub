import { Inject, Injectable } from '@nestjs/common';
import { chunksOf, type TextChunk } from '../domain/chunks.js';
import {
  RepresentationRepository,
  type RepresentationKey,
} from '../domain/representation.js';
import { Embedder, TextIndex } from './ports.js';

// Puts the newest text a processor made of some content into the search
// index, each chunk with its vector when there's an embedder, or takes it
// out once there's none. Whichever version a job names, the newest is
// indexed, so a job for an older one is harmless. The signal stops the
// embedding partway, which writes nothing.
@Injectable()
export class IndexText {
  constructor(
    private readonly representations: RepresentationRepository,
    private readonly index: TextIndex,
    // none for BM25 only
    @Inject(Embedder) private readonly embedder: Embedder | null,
  ) {}

  async run({ hash, processor }: RepresentationKey, signal?: AbortSignal) {
    const newest = await this.representations.newest(hash, processor);
    if (!newest) return this.index.remove({ hash, processor });
    const { parts, ...key } = newest;
    await this.index.put(key, await this.embedded(chunksOf(parts), signal));
  }

  private async embedded(chunks: TextChunk[], signal?: AbortSignal) {
    if (!this.embedder || !chunks.length) return chunks;
    const vectors = await this.embedder.embed(
      chunks.map(({ text }) => text),
      signal,
    );
    return chunks.map((chunk, i) => ({ ...chunk, vector: vectors[i] }));
  }
}
