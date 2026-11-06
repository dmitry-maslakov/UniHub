import type { API, Types } from '@opensearch-project/opensearch';
import type { TextQuery } from '../../application/ports.js';
import type { TextHit } from '../../application/queries.js';
import { HIGHLIGHT, type TextChunk } from '../../domain/chunks.js';
import type { RecordKind } from '../../domain/records.js';
import type { RepresentationKey } from '../../domain/representation.js';
import { snippetOf } from './snippet.js';
import { indexBody } from './text-index.mapping.js';

// A search of the text index, and its answer read back as SearchTextsQuery
// gives it.

// pages shown per content, and records
const PAGES = 3;
// chunks asked for per content: more than pages, as the best ones may share
// a page, which is shown once, or a record
const CHUNKS = 10;
// a snippet's length: of the highlighted fragment, or of the chunk's start
// where nothing in it is
const SNIPPET_CHARS = 400;
// every analysis of the text: exact forms, stems, identifiers
const FIELDS = [
  'text',
  ...Object.keys(indexBody(null).mappings.properties.text.fields).map(
    (field) => `text.${field}`,
  ),
];
// the chunks knn takes, nearest first, and as many of the words' hits: past
// the 50 contents a search answers at most, as a content's best chunks are
// often several
const DEPTH = 100;
// how many candidates HNSW looks at: under a filter that keeps a tenth of
// the chunks, 256 found all of the true nearest (100 found 97%)
const EF_SEARCH = 256;

// what's read of a chunk: the page of a text it's on, or the record it's of
type PageDoc = Pick<RepresentationKey, 'processor' | 'version'> &
  Pick<TextChunk, 'page'>;
type RecordDoc = { kind: RecordKind; record: string; member?: string };

// A hit per content (or post's text), its best chunks inside, each with a
// fragment highlighted by whichever analysis matched.
const collapse: Types.Core_Search.FieldCollapse = {
  field: 'hash',
  inner_hits: {
    name: 'pages',
    size: CHUNKS,
    _source: [
      'processor',
      'version',
      'page',
      'kind',
      'record',
      'member',
    ] satisfies (keyof PageDoc | keyof RecordDoc)[],
    highlight: {
      type: 'unified',
      encoder: 'default',
      pre_tags: [HIGHLIGHT.open],
      post_tags: [HIGHLIGHT.close],
      fields: {
        text: {
          matched_fields: FIELDS,
          fragment_size: SNIPPET_CHARS,
          number_of_fragments: 1,
          no_match_size: SNIPPET_CHARS,
        },
      },
    },
  },
};

const words = (text: string) =>
  ({
    multi_match: { query: text, type: 'most_fields', fields: FIELDS },
  }) satisfies Types.Common_QueryDsl.QueryContainer;

// the records of a kind with these ids, if any
const records = (kind: RecordKind, ids: readonly string[]) =>
  ids.length
    ? [{ bool: { filter: [{ term: { kind } }, { terms: { record: ids } }] } }]
    : [];

// The chunks of these contents only, by these processors, and of these
// records, filtered in the query itself: a post_filter would cut knn's k
// nearest down afterwards, to few or none. Past 65,536 ids of one kind
// (index.max_terms_count) OpenSearch refuses the query with a 400 that says
// so, which goes up as it came.
const among = ({
  among: { contents, posts, files, archives },
  processors,
}: TextQuery) => ({
  bool: {
    should: [
      ...(contents.length
        ? [
            {
              bool: {
                filter: [
                  { terms: { hash: contents } },
                  { terms: { processor: processors } },
                ],
              },
            },
          ]
        : []),
      ...records('post', posts),
      ...records('file', files),
      ...records('tree', archives),
    ],
    minimum_should_match: 1,
  },
});

// BM25 alone: no vector for the query, or an index without vectors
export const keywordBody = (query: TextQuery) =>
  ({
    size: query.size,
    _source: ['hash'],
    query: { bool: { must: words(query.text), filter: among(query) } },
    collapse,
  }) satisfies API.Search_RequestBody;

// The words and the meaning, scored apart and put together by the hybrid
// pipeline (text-index.mapping.ts), a part each. The filter is the hybrid
// query's own, which OpenSearch applies to both parts, knn's before it
// picks its nearest.
export const hybridBody = (query: TextQuery & { vector: number[] }) =>
  ({
    size: query.size,
    _source: ['hash'],
    query: {
      hybrid: {
        filter: among(query),
        pagination_depth: DEPTH,
        queries: [
          words(query.text),
          {
            knn: {
              vector: {
                vector: query.vector,
                k: DEPTH,
                method_parameters: { ef_search: EF_SEARCH },
              },
            },
          },
        ],
      },
    },
    collapse,
  }) satisfies API.Search_RequestBody;

// By meaning too with the query's vector, into an index that has them (one
// with a pipeline); by the words alone otherwise
export const searchRequest = (query: TextQuery, pipeline: string | null) => {
  const { vector } = query;
  return vector && pipeline
    ? { search_pipeline: pipeline, body: hybridBody({ ...query, vector }) }
    : { body: keywordBody(query) };
};

// the first of each, the best, up to PAGES
const firstOf = <T>(items: T[], by: (item: T) => string) =>
  [...Map.groupBy(items, by).values()].slice(0, PAGES).map(([first]) => first);

// A content per hit, as both bodies collapse them, its chunks the inner
// hits named pages, each with a fragment (no_match_size gives one to every
// chunk): its texts' as its best pages, each by the best of its chunks
// there, and its records' as they are, each by its best chunk, a tree's
// members apart.
export const contentHits = (
  hits: Types.Core_Search.Hit<Pick<RepresentationKey, 'hash'>>[],
): TextHit[] =>
  hits.map(({ _source, inner_hits }) => {
    const chunks = (
      inner_hits!.pages.hits.hits as Types.Core_Search.Hit<
        PageDoc | RecordDoc
      >[]
    ).map(({ _source, highlight }) => ({
      doc: _source!,
      snippet: snippetOf(highlight!.text[0]),
    }));
    const pages = chunks.flatMap(({ doc, snippet }) =>
      'processor' in doc ? [{ ...doc, snippet }] : [],
    );
    const records = chunks.flatMap(({ doc, snippet }) =>
      'kind' in doc
        ? [
            {
              kind: doc.kind,
              record: doc.record,
              member: doc.member ?? null,
              snippet,
            },
          ]
        : [],
    );
    return {
      hash: _source!.hash,
      pages: firstOf(pages, ({ processor, page }) => `${processor}/${page}`),
      records: firstOf(
        records,
        ({ kind, record, member }) => `${kind}/${record}/${member}`,
      ),
    };
  });
