import { z } from 'zod';
import { settings } from '../platform/config/settings.js';

// unset when empty, as .env.example leaves them
const blank = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

// The search index's embedder, if any: without one it's BM25 only. And the
// reranker, if any: without one a search answers in the index's order.
export const textSearchSettings = z
  .object({
    // the TEI server that embeds the chunks being indexed
    EMBEDDING_URL: blank(z.url()),
    // the same model on a server of its own, so a query never waits behind
    // indexing (TEI's queue is first come, first served)
    EMBEDDING_QUERY_URL: blank(z.url()),
    // the model and its revision as the embedder's /info names them
    // (bge-m3-5617a9f6), checked there; part of the index's name, so another
    // model is another index
    EMBEDDING_MODEL: blank(z.string().regex(/^[a-z0-9][a-z0-9-]*$/)),
    EMBEDDING_DIMENSIONS: blank(z.coerce.number().int().positive()),
    // the TEI server of a reranker
    RERANK_URL: blank(z.url()),
    // the best contents it reorders: 20 short texts take it about 1.3 s on
    // 6 arm cores, 3 s on 8 amd64 ones (README, Deploying search); a search
    // answers 50 at most
    RERANK_CANDIDATES: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine(
    (env) =>
      !env.EMBEDDING_URL || (env.EMBEDDING_MODEL && env.EMBEDDING_DIMENSIONS),
    {
      path: ['EMBEDDING_URL'],
      message: 'needs EMBEDDING_MODEL and EMBEDDING_DIMENSIONS',
    },
  )
  .transform((env) => ({
    embedding: env.EMBEDDING_URL
      ? {
          url: env.EMBEDDING_URL,
          queryUrl: env.EMBEDDING_QUERY_URL ?? env.EMBEDDING_URL,
          model: env.EMBEDDING_MODEL!,
          dimensions: env.EMBEDDING_DIMENSIONS!,
        }
      : null,
    rerank: env.RERANK_URL
      ? { url: env.RERANK_URL, candidates: env.RERANK_CANDIDATES }
      : null,
  }));

export const textSearchConfig = settings('textSearch', textSearchSettings);
