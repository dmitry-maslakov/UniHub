import type { Types } from '@opensearch-project/opensearch';
import type { ContentHash, PluginName } from '@app/kernel';
import type { ContentHit, PageHit } from '../../application/ports.js';
import type { TextChunk } from '../../domain/chunks.js';
import { keyId, type RepresentationKey } from '../../domain/representation.js';
import { snippetOf } from './snippet.js';
import { SNIPPET_CHARS } from './text-index.mapping.js';

// What the index holds of a text: a document per chunk, and a manifest once
// they're all in, which has no text and so is never a hit. Ids are made of
// the key, so writing a text again replaces its documents.

// only the key's own fields: the mapping takes no others
const fieldsOf = ({ hash, processor, version }: RepresentationKey) => ({
  hash,
  processor,
  version,
});

type ChunkDoc = RepresentationKey & TextChunk;

// a bulk index action and its document, per chunk
export const chunkDocs = (
  key: RepresentationKey,
  chunks: readonly TextChunk[],
) =>
  chunks.map(({ page, chunk, text }) => [
    { index: { _id: `${keyId(key)}__${page}__${chunk}` } },
    { ...fieldsOf(key), page, chunk, text } satisfies ChunkDoc,
  ]);

export const manifest = (key: RepresentationKey, chunks: number) => ({
  id: keyId(key),
  body: { ...fieldsOf(key), chunks },
});

// The documents of every version of a text, or of all but one: newer ones
// too, as postgres may have lost them (restored from before a processor's
// bump, the processor rolled back with it).
export const versionsOf = (
  { hash, processor }: { hash: ContentHash; processor: PluginName },
  except?: number,
): Types.Common_QueryDsl.QueryContainer => ({
  bool: {
    filter: [{ term: { hash } }, { term: { processor } }],
    ...(except !== undefined && {
      must_not: [{ term: { version: except } }],
    }),
  },
});

// a page of the manifests' keys, after the page that ended at `after`
export const manifestKeys = (
  after?: Types.Common_Aggregations.CompositeAggregateKey,
) => ({
  size: 0,
  query: { exists: { field: 'chunks' } },
  aggs: {
    keys: {
      composite: {
        size: 1_000,
        sources: ['hash', 'processor', 'version'].map((field) => ({
          [field]: { terms: { field } },
        })),
        ...(after && { after }),
      },
    },
  },
});

// a chunk among a content's best, as a page with a snippet
const pageHit = ({ _source, highlight }: Types.Core_Search.Hit<ChunkDoc>) => {
  const { processor, version, page, chunk, text } = _source!;
  // no_match_size gives every hit one; the chunk's start if ever not
  const fragment = highlight?.text?.[0] ?? text.slice(0, SNIPPET_CHARS);
  return {
    processor,
    version,
    page,
    chunk,
    snippet: snippetOf(fragment),
  } satisfies PageHit;
};

// A search's hits read back as chunkDocs wrote them: a content per hit, as
// keywordBody collapses them, its best chunks the inner hits named pages.
export const contentHits = (hits: Types.Core_Search.Hit<ChunkDoc>[]) =>
  hits.map(({ _source, _score, inner_hits }): ContentHit => ({
    hash: _source!.hash,
    score: _score!,
    pages: inner_hits!.pages.hits.hits.map(pageHit),
  }));
