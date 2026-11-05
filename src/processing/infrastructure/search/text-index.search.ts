import type { API, Types } from '@opensearch-project/opensearch';
import type { TextQuery } from '../../application/ports.js';
import type { TextHit } from '../../application/queries.js';
import { HIGHLIGHT, type TextChunk } from '../../domain/chunks.js';
import type { RepresentationKey } from '../../domain/representation.js';
import { snippetOf } from './snippet.js';
import { indexBody } from './text-index.mapping.js';

// A search of the text index, and its answer read back as SearchTextsQuery
// gives it.

// pages shown per content
const PAGES = 3;
// chunks asked for per content: more than pages, as the best ones may share
// a page, which is shown once
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

// what's read of a chunk: the page it's on
type PageDoc = Pick<RepresentationKey, 'processor' | 'version'> &
  Pick<TextChunk, 'page'>;

// A hit per content, its best chunks inside, each with a fragment
// highlighted by whichever analysis matched.
const collapse: Types.Core_Search.FieldCollapse = {
  field: 'hash',
  inner_hits: {
    name: 'pages',
    size: CHUNKS,
    _source: ['processor', 'version', 'page'] satisfies (keyof PageDoc)[],
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

// The chunks of these contents only, filtered in the query itself: a
// post_filter would cut knn's k nearest down afterwards, to few or none.
// Past 65,536 hashes (index.max_terms_count) OpenSearch refuses the query
// with a 400 that says so, which goes up as it came.
const among = (hashes: TextQuery['hashes']) => ({ terms: { hash: hashes } });

// BM25 alone: no vector for the query, or an index without vectors
export const keywordBody = ({ text, hashes, size }: TextQuery) =>
  ({
    size,
    _source: ['hash'],
    query: { bool: { must: words(text), filter: among(hashes) } },
    collapse,
  }) satisfies API.Search_RequestBody;

// The words and the meaning, scored apart and put together by the hybrid
// pipeline (text-index.mapping.ts), a part each. The filter is the hybrid
// query's own, which OpenSearch applies to both parts, knn's before it
// picks its nearest.
export const hybridBody = ({
  text,
  vector,
  hashes,
  size,
}: TextQuery & { vector: number[] }) =>
  ({
    size,
    _source: ['hash'],
    query: {
      hybrid: {
        filter: among(hashes),
        pagination_depth: DEPTH,
        queries: [
          words(text),
          {
            knn: {
              vector: {
                vector,
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

// A content's best chunks as its best pages, each by the best of its chunks
// there. no_match_size gives every chunk a fragment.
const bestPages = (chunks: Types.Core_Search.Hit<PageDoc>[]) =>
  [
    ...Map.groupBy(
      chunks,
      ({ _source }) => `${_source!.processor}/${_source!.page}`,
    ).values(),
  ]
    .slice(0, PAGES)
    .map(([{ _source, highlight }]) => {
      const { processor, version, page } = _source!;
      return {
        processor,
        version,
        page,
        snippet: snippetOf(highlight!.text[0]),
      };
    });

// a content per hit, as both bodies collapse them, its chunks the inner
// hits named pages
export const contentHits = (
  hits: Types.Core_Search.Hit<Pick<RepresentationKey, 'hash'>>[],
): TextHit[] =>
  hits.map(({ _source, inner_hits }) => ({
    hash: _source!.hash,
    pages: bestPages(inner_hits!.pages.hits.hits),
  }));
