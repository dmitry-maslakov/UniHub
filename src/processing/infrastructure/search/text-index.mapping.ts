import type { API, Types } from '@opensearch-project/opensearch';
import type { TextQuery } from '../../application/ports.js';
import { CLOSE, OPEN } from './snippet.js';

// Part of the index's name: raised with any change to its settings, its
// mapping or the chunker (chunks.ts), so the new index is filled anew from
// Postgres next to the old one.
export const GENERATION = 1;

// BM25 only, no vectors yet
export const indexName = (prefix: string) =>
  `${prefix}-texts-g${GENERATION}-bm25`;

// The same folding in every analyzer, so that Cyrillic, Latin and Latin
// without č ć š ž đ give the same tokens. Stock lowercase and asciifolding
// stand in for ICU, which the stock image lacks, and fold precomposed letters
// only: chunksOf makes the text NFC, and a query is to be too (some PDFs
// give č as c and a caron). dj → d makes Đorđe and Djordje one.
const fold = [
  'lowercase',
  'serbian_normalization',
  'asciifolding',
  'uh_dj_to_d',
];

const analysis: Types.Indices_Common.IndexSettingsAnalysis = {
  tokenizer: {
    code_tokenizer: {
      type: 'char_group',
      // not at . / _ : they stay in an identifier (System.out.println, src/main.c)
      tokenize_on_chars: [
        'whitespace',
        ...'( ) [ ] { } < > , ; " \' ` = + * ! ? & | ^ % ~ \\'.split(' '),
      ],
      max_token_length: 255,
    },
  },
  filter: {
    uh_dj_to_d: {
      type: 'pattern_replace',
      pattern: 'dj',
      replacement: 'd',
      all: true,
    },
    // not in OpenSearch's docs, it falls back to Lucene's SerbianStemmer:
    // search-analysis.e2e-spec.ts pins what it does
    uh_sr_stem: { type: 'stemmer', language: 'serbian' },
    uh_code_split: {
      type: 'word_delimiter_graph',
      preserve_original: true,
      split_on_case_change: true,
      split_on_numerics: false,
      generate_word_parts: true,
      generate_number_parts: true,
      catenate_words: false,
      catenate_numbers: false,
      catenate_all: false,
      stem_english_possessive: false,
      adjust_offsets: true,
    },
    // IOException → IO, Exception
    uh_code_acronym: {
      type: 'pattern_capture',
      preserve_original: true,
      patterns: [
        String.raw`(\p{Lu}+)(?=\p{Lu}\p{Ll})`,
        String.raw`(?<=\p{Lu})(\p{Lu}\p{Ll}+)`,
      ],
    },
    uh_en_possessive: { type: 'stemmer', language: 'possessive_english' },
    uh_en_stop: { type: 'stop', stopwords: '_english_' },
    uh_en_stem: { type: 'stemmer', language: 'english' },
  },
  analyzer: {
    uh_fold: { type: 'custom', tokenizer: 'standard', filter: fold },
    uh_sr: {
      type: 'custom',
      tokenizer: 'standard',
      filter: [...fold, 'uh_sr_stem'],
    },
    uh_en: {
      type: 'custom',
      tokenizer: 'standard',
      filter: ['uh_en_possessive', ...fold, 'uh_en_stop', 'uh_en_stem'],
    },
    uh_code_index: {
      type: 'custom',
      tokenizer: 'code_tokenizer',
      filter: [
        'uh_code_split',
        'uh_code_acronym',
        ...fold,
        'remove_duplicates',
        'flatten_graph',
      ],
    },
    uh_code_search: {
      type: 'custom',
      tokenizer: 'code_tokenizer',
      filter: ['uh_code_split', ...fold],
    },
  },
};

// The text index without vectors (BM25 only): chunks of texts and a manifest
// per text. The body of PUT /<index>.
export const indexBody = () =>
  ({
    settings: {
      index: {
        number_of_shards: 1,
        number_of_replicas: 0,
        'highlight.max_analyzed_offset': 1_000_000,
      },
      analysis,
    },
    mappings: {
      dynamic: 'strict',
      _meta: { generation: GENERATION },
      properties: {
        hash: { type: 'keyword' },
        processor: { type: 'keyword' },
        version: { type: 'integer' },
        page: { type: 'integer' },
        chunk: { type: 'integer' },
        chunks: { type: 'integer' },
        // exact forms (phrases), Serbian and English stems, identifiers
        text: {
          type: 'text',
          analyzer: 'uh_fold',
          fields: {
            sr: { type: 'text', analyzer: 'uh_sr' },
            en: { type: 'text', analyzer: 'uh_en' },
            code: {
              type: 'text',
              analyzer: 'uh_code_index',
              search_analyzer: 'uh_code_search',
            },
          },
        },
      },
    },
  }) satisfies API.Indices_Create_RequestBody;

// a snippet's length: of the highlighted fragment, or of the chunk's start
// where nothing in it is
export const SNIPPET_CHARS = 400;
// every analysis of the text above: exact forms, stems, identifiers
const FIELDS = ['text', 'text.sr', 'text.en', 'text.code'];
const SOURCE = ['hash', 'processor', 'version', 'page', 'chunk', 'text'];

// A hit per content, its best chunks inside, each with a fragment
// highlighted by whichever analysis matched.
const collapse: Types.Core_Search.FieldCollapse = {
  field: 'hash',
  inner_hits: {
    name: 'pages',
    size: 3,
    _source: SOURCE,
    highlight: {
      type: 'unified',
      encoder: 'default',
      pre_tags: [OPEN],
      post_tags: [CLOSE],
      // chunks are far shorter, but one past the index's
      // highlight.max_analyzed_offset would fail the whole search
      max_analyzer_offset: 1_000_000,
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

// BM25 over the chunks of these contents only. The hashes filter the query
// itself, as knn will need too: a post_filter would cut its k nearest down
// afterwards, to few or none. Past 65,536 of them (index.max_terms_count)
// OpenSearch refuses the query with a 400 that says so, which goes up as it
// came.
export const keywordBody = ({ text, hashes, size }: TextQuery) =>
  ({
    size,
    _source: SOURCE,
    query: {
      bool: {
        must: {
          multi_match: { query: text, type: 'most_fields', fields: FIELDS },
        },
        filter: { terms: { hash: hashes } },
      },
    },
    collapse,
  }) satisfies API.Search_RequestBody;
