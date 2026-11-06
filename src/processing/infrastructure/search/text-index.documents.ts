import type { Types } from '@opensearch-project/opensearch';
import type { ContentHash, PluginName } from '@app/kernel';
import type {
  IndexedChunk,
  IndexedRecordChunk,
} from '../../application/ports.js';
import { refId, type RecordKey, type RecordRef } from '../../domain/records.js';
import { keyId, type RepresentationKey } from '../../domain/representation.js';

// What the index holds of a text, or of a record: a document per chunk, and
// a manifest once they're all in, which has no text and so is never a hit.
// Ids are made of the key, so writing a text again replaces its documents;
// a record's of its ref and their number, so writing it again overwrites
// them, and those past its new number go with its old fingerprint.

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

// the record's own fields, then the chunk's
export const recordDocs = (
  key: RecordKey,
  chunks: readonly IndexedRecordChunk[],
) =>
  chunks.map(({ hash, text, member, vector }, chunk) => [
    { index: { _id: `${refId(key)}__${chunk}` } },
    {
      kind: key.kind,
      record: key.id,
      fingerprint: key.fingerprint,
      hash,
      chunk,
      text,
      ...(member !== undefined && { member }),
      ...(vector && { vector }),
    },
  ]);

export const recordManifest = (key: RecordKey, chunks: number) => ({
  id: refId(key),
  body: {
    kind: key.kind,
    record: key.id,
    fingerprint: key.fingerprint,
    chunks,
  },
});

// a record's documents, or those made from another fingerprint than this
export const recordOf = (
  { kind, id }: RecordRef,
  except?: string,
): Types.Common_QueryDsl.QueryContainer => ({
  bool: {
    filter: [{ term: { kind } }, { term: { record: id } }],
    ...(except !== undefined && {
      must_not: [{ term: { fingerprint: except } }],
    }),
  },
});

// a page of the manifests' keys, a text's or a record's by their fields,
// after the page that ended at `after`
const keysOf =
  (fields: string[]) =>
  (after?: Types.Common_Aggregations.CompositeAggregateKey) => ({
    size: 0,
    query: {
      bool: {
        filter: [
          { exists: { field: 'chunks' } },
          ...fields.map((field) => ({ exists: { field } })),
        ],
      },
    },
    aggs: {
      keys: {
        composite: {
          size: 1_000,
          sources: fields.map((field) => ({ [field]: { terms: { field } } })),
          ...(after && { after }),
        },
      },
    },
  });

export const manifestKeys = keysOf(['hash', 'processor', 'version']);
// read back as RecordKey's fields
export const recordManifestKeys = keysOf(['kind', 'record', 'fingerprint']);
