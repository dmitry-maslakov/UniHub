import { describe, expect, it } from 'vitest';
import { parseSearch, stringifySearch } from './search-params';

describe('the search params', () => {
  it('come back as they went, repeated keys and numbers alike', () => {
    const query =
      '?client_id=app&ba_iat=1730000000&ba_param=client_id&ba_param=sig&sig=a1b2';
    const search = parseSearch(query);
    expect(search).toEqual({
      client_id: 'app',
      ba_iat: '1730000000',
      ba_param: ['client_id', 'sig'],
      sig: 'a1b2',
    });
    expect(stringifySearch(search)).toBe(query);
  });

  it('leave out what is unset', () => {
    expect(stringifySearch({ next: undefined })).toBe('');
  });
});
