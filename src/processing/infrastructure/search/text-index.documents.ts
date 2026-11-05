import type { Types } from '@opensearch-project/opensearch';
import type { ContentHash, PluginName } from '@app/kernel';
import type { IndexedChunk } from '../../application/ports.js';
import { keyId, type RepresentationKey } from '../../domain/representation.js';

// What the index holds of a text: a document per chunk, and a manifest once
// they're all in, which has no text and so is never a hit. Ids are made of
// the key, so writing a text again replaces its documents.

// only the key's own fields: the mapping takes no others
const fieldsOf = ({ hash, processor, version }: RepresentationKey) => ({
  hash,
  processor,
  version,
});

// a bulk index action and its document, per chunk
export const chunkDocs = (
  key: RepresentationKey,
  chunks: readonly IndexedChunk[],
) =>
  chunks.map(({ page, chunk, text, vector }) => [
    { index: { _id: `${keyId(key)}__${page}__${chunk}` } },
    { ...fieldsOf(key), page, chunk, text, ...(vector && { vector }) },
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
