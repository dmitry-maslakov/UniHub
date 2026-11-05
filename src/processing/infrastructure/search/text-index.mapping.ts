import type { API, Types } from '@opensearch-project/opensearch';

// Part of the index's name: raised with any change to its settings, its
// mapping or the chunker (chunks.ts), so the new index is filled anew from
// Postgres next to the old one.
export const GENERATION = 1;

// the embedder whose vectors the index holds (EMBEDDING_MODEL and
// EMBEDDING_DIMENSIONS); none for BM25 only
export type Vectors = { model: string; dimensions: number } | null;

// Another model, or the same one at another revision, is another index:
// vectors of two models never mix in one.
export const indexName = (prefix: string, vectors: Vectors) =>
  `${prefix}-texts-g${GENERATION}-${vectors ? `${vectors.model}-${vectors.dimensions}` : 'bm25'}`;

export const pipelineName = (prefix: string) => `${prefix}-hybrid`;

// How a hybrid search's scores are put together: each part's made 0 to 1
// over its hits (knn always gives its k nearest, so the best of them is 1
// whatever it is), then their mean, a weight per part. Changed by putting
// it again with a new version, no new generation.
export const PIPELINE = {
  description:
    'UniHub hybrid: min_max, then arithmetic_mean of (words, meaning)',
  version: 1,
  phase_results_processors: [
    {
      'normalization-processor': {
        normalization: { technique: 'min_max' },
        combination: {
          technique: 'arithmetic_mean',
          parameters: { weights: [0.5, 0.5] },
        },
      },
    },
  ],
} satisfies API.SearchPipeline_Put_Request['body'];

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

// Chunks of texts, with their vectors when there's an embedder, and a
// manifest per text. The body of PUT /<index>; `_meta` says what made it.
export const indexBody = (vectors: Vectors) =>
  ({
    settings: {
      index: {
        number_of_shards: 1,
        number_of_replicas: 0,
        ...(vectors && { knn: true }),
        'highlight.max_analyzed_offset': 1_000_000,
      },
      analysis,
    },
    mappings: {
      dynamic: 'strict',
      _meta: {
        generation: GENERATION,
        ...(vectors && {
          model: vectors.model,
          dimensions: vectors.dimensions,
        }),
      },
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
        ...(vectors && {
          // HNSW in Lucene, which filters before it searches, so the
          // contents' filter keeps knn's k nearest (m and ef_construction as
          // recall was measured)
          vector: {
            type: 'knn_vector',
            dimension: vectors.dimensions,
            space_type: 'cosinesimil',
            method: {
              name: 'hnsw',
              engine: 'lucene',
              parameters: { m: 16, ef_construction: 100 },
            },
          },
        }),
      },
    },
  }) satisfies API.Indices_Create_RequestBody;
