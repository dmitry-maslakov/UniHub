import { createHash } from 'node:crypto';
import { Embedder } from '../src/processing/application/ports.js';

// An embedder for the specs, no model: a text's words, letters folded
// (diacritics off, lower case), counted into `dimensions` buckets by their
// hash, then made unit length. Texts with the same words get the same
// vector, texts of no common word ones far apart.
export class FakeEmbedder extends Embedder {
  constructor(private readonly dimensions: number) {
    super();
  }

  async embed(texts: readonly string[]) {
    return texts.map((text) => this.vectorOf(text));
  }

  private vectorOf(text: string) {
    const folded = text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
    const words = folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const vector = Array<number>(this.dimensions).fill(0);
    // a text of no words still gets a vector, cosine takes no zero one
    for (const word of words.length ? words : [folded])
      vector[
        createHash('sha256').update(word).digest().readUInt32BE() %
          this.dimensions
      ]++;
    const length = Math.hypot(...vector);
    return vector.map((x) => x / length);
  }
}
