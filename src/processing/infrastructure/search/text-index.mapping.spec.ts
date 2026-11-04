import { GENERATION, indexBody } from './text-index.mapping.js';

describe('text index mapping', () => {
  // indices of a generation hold documents analysed by its body: a change to
  // it, seen here, comes with a new GENERATION
  it('changes with its generation only', () => {
    expect({ GENERATION, body: indexBody() }).toMatchSnapshot();
  });
});
