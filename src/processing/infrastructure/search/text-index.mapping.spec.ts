import { sha256 } from '../../../../test/sha256.js';
import { CHUNK_CHARS } from '../../domain/chunks.js';
import {
  GENERATION,
  indexBody,
  indexName,
  PIPELINE,
  pipelineName,
} from './text-index.mapping.js';
import { hybridBody } from './text-index.search.js';

const bgeM3 = { model: 'bge-m3-5617a9f6', dimensions: 1024 };

describe('text index mapping', () => {
  // indices of a generation hold documents analysed by its body and cut by
  // its chunker: a change to either, seen here, comes with a new GENERATION
  it('changes with its generation only', () => {
    expect({ GENERATION, CHUNK_CHARS, body: indexBody(null) }).toMatchSnapshot();
  });

  it('changes with its generation only, with vectors too', () => {
    expect({ GENERATION, body: indexBody(bgeM3) }).toMatchSnapshot();
  });

  it('names the index by its generation and its vectors, the pipeline by the prefix', () => {
    expect(indexName('unihub-e2e', null)).toBe(
      `unihub-e2e-texts-g${GENERATION}-bm25`,
    );
    expect(indexName('unihub', bgeM3)).toBe(
      `unihub-texts-g${GENERATION}-bge-m3-5617a9f6-1024`,
    );
    expect(pipelineName('unihub-e2e')).toBe('unihub-e2e-hybrid');
  });

  // OpenSearch refuses a hybrid search whose weights aren't one a part
  it('weighs the words and the meaning alike, a weight per part of the hybrid query', () => {
    const [{ 'normalization-processor': processor }] =
      PIPELINE.phase_results_processors;
    const { queries } = hybridBody({
      text: 'semafor',
      vector: [1],
      hashes: [sha256('lecture')],
      size: 10,
    }).query.hybrid;

    expect(processor).toEqual({
      normalization: { technique: 'min_max' },
      combination: {
        technique: 'arithmetic_mean',
        parameters: { weights: [0.5, 0.5] },
      },
    });
    expect(processor.combination.parameters.weights).toHaveLength(
      queries.length,
    );
  });
});
