import { createHash } from 'node:crypto';
import { Embedder, Reranker } from '../src/processing/application/ports.js';

// Models for the specs, none downloaded: they read a text as its words,
// letters folded (diacritics off, lower case).
const fold = (text: string) =>
  text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const wordsOf = (text: string) =>
  fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

// A text's words counted into `dimensions` buckets by their hash, then made
// unit length. Texts with the same words get the same vector, texts of no
// common word ones far apart.
export class FakeEmbedder extends Embedder {
  constructor(private readonly dimensions: number) {
    super();
  }

  async embed(texts: readonly string[]) {
    return texts.map((text) => this.vectorOf(text));
  }

  private vectorOf(text: string) {
    const words = wordsOf(text);
    const vector = Array<number>(this.dimensions).fill(0);
    // a text of no words still gets a vector, cosine takes no zero one
    for (const word of words.length ? words : [fold(text)])
      vector[
        createHash('sha256').update(word).digest().readUInt32BE() %
          this.dimensions
      ]++;
    const length = Math.hypot(...vector);
    return vector.map((x) => x / length);
  }
}

// A text scores the number of the query's words it has, each once, so texts
// with as many tie. Takes 20, as RERANK_CANDIDATES does by default.
export class FakeReranker extends Reranker {
  constructor(readonly candidates = 20) {
    super();
  }

  async scores(query: string, texts: readonly string[]) {
    const asked = new Set(wordsOf(query));
    return texts.map(
      (text) => new Set(wordsOf(text).filter((word) => asked.has(word))).size,
    );
  }
}
