import type { Types } from '@opensearch-project/opensearch';
import type { ContentHash, PluginName } from '@app/kernel';
import type { TextChunk } from '../../domain/chunks.js';
import type { RepresentationKey } from '../../domain/representation.js';

// What the index holds of a text: a document per chunk, and a manifest once
// they're all in, which has no text and so is never a hit. Ids are made of
// the key, so writing a text again replaces its documents.

const idOf = ({ hash, processor, version }: RepresentationKey) =>
  `${hash}:${processor}:${version}`;

// only the key's own fields: the mapping takes no others
const fieldsOf = ({ hash, processor, version }: RepresentationKey) => ({
  hash,
  processor,
  version,
});

// a bulk index action and its document, per chunk
export const chunkDocs = (
  key: RepresentationKey,
  chunks: readonly TextChunk[],
) =>
  chunks.map(({ page, chunk, text }) => [
    { index: { _id: `${idOf(key)}:${page}:${chunk}` } },
    { ...fieldsOf(key), page, chunk, text },
  ]);

export const manifest = (key: RepresentationKey, chunks: number) => ({
  id: idOf(key),
  body: { ...fieldsOf(key), chunks },
});

// the documents of every version of a text, or of those below one
export const versionsOf = (
  { hash, processor }: { hash: ContentHash; processor: PluginName },
  below?: number,
): Types.Common_QueryDsl.QueryContainer => ({
  bool: {
    filter: [
      { term: { hash } },
      { term: { processor } },
      ...(below === undefined ? [] : [{ range: { version: { lt: below } } }]),
    ],
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
