import type { API, Types } from '@opensearch-project/opensearch';

// Part of the index's name: raised with any change to its settings or mapping,
// so the new index is filled anew from Postgres next to the old one.
export const GENERATION = 1;

// The same folding in every analyzer, so that Cyrillic, Latin and Latin
// without č ć š ž đ give the same tokens. Stock lowercase and asciifolding
// stand in for ICU, which the stock image lacks, and fold precomposed letters
// only: the code that writes and queries the index is to make text NFC (some
// PDFs give č as c and a caron). dj → d makes Đorđe and Djordje one.
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
