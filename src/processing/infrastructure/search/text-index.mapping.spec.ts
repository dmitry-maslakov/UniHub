import { sha256 } from '../../../../test/sha256.js';
import { CHUNK_CHARS } from '../../domain/chunks.js';
import {
  GENERATION,
  indexBody,
  indexName,
  keywordBody,
} from './text-index.mapping.js';

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

// On a small index a post_filter finds what the query's own filter does
// (the e2e specs can't tell them apart), on a big one too few or none.
describe('search bodies', () => {
  const hashes = [sha256('lecture'), sha256('exercises')];
  const body = keywordBody({ text: 'semafor', hashes, size: 7 });

  it('looks only through the contents named, in the query itself', () => {
    expect(body.query.bool.filter).toEqual({ terms: { hash: hashes } });
    expect(body.query.bool.filter.terms.hash).toBe(hashes);
    expect(body).not.toHaveProperty('post_filter');
  });

  it('asks for that many contents, a hit each with its best chunks', () => {
    expect(body.size).toBe(7);
    expect(body.collapse).toMatchObject({
      field: 'hash',
      inner_hits: { name: 'pages', size: 3 },
    });
  });

  it('matches the words in every analysis of the text', () => {
    expect(body.query.bool.must.multi_match).toEqual({
      query: 'semafor',
      type: 'most_fields',
      fields: ['text', 'text.sr', 'text.en', 'text.code'],
    });
  });
});
