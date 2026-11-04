import { CHUNK_CHARS } from '../../domain/chunks.js';
import { GENERATION, indexBody, indexName } from './text-index.mapping.js';

describe('text index mapping', () => {
  // indices of a generation hold documents analysed by its body and cut by
  // its chunker: a change to either, seen here, comes with a new GENERATION
  it('changes with its generation only', () => {
    expect({ GENERATION, CHUNK_CHARS, body: indexBody() }).toMatchSnapshot();
  });

  it('names the index by its generation', () => {
    expect(indexName('unihub-e2e')).toBe(
      `unihub-e2e-texts-g${GENERATION}-bm25`,
    );
  });
});
