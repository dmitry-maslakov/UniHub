import { Inject, Injectable } from '@nestjs/common';
import { chunksOf, type TextChunk } from '../domain/chunks.js';
import {
  RepresentationRepository,
  type RepresentationKey,
} from '../domain/representation.js';
import { Embedder, TextIndex } from './ports.js';

// Chunks per embed: a bigger batch gets through no faster on a CPU, and a
// search's query, on the same model, would wait longer behind it.
export const EMBED_BATCH = 8;

// Puts the newest text a processor made of some content into the search
// index, each chunk with its vector when there's an embedder, or takes it
// out once there's none. Whichever version a job names, the newest is
// indexed, so a job for an older one is harmless.
@Injectable()
export class IndexText {
  constructor(
    private readonly representations: RepresentationRepository,
    private readonly index: TextIndex,
    // none for BM25 only
    @Inject(Embedder) private readonly embedder: Embedder | null,
  ) {}

  async run({ hash, processor }: RepresentationKey) {
    const newest = await this.representations.newest(hash, processor);
    if (!newest) return this.index.remove({ hash, processor });
    const { parts, ...key } = newest;
    await this.index.put(key, await this.embedded(chunksOf(parts)));
  }

  private async embedded(chunks: TextChunk[]) {
    if (!this.embedder) return chunks;
    const vectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH)
      vectors.push(
        ...(await this.embedder.embed(
          chunks.slice(i, i + EMBED_BATCH).map(({ text }) => text),
        )),
      );
    return chunks.map((chunk, i) => ({ ...chunk, vector: vectors[i] }));
  }
}
