import { searchRequest } from './search-request.js';

// what the request adds to its values (the kernel's StoredText, catalog's
// Slug): its bounds and defaults
describe('searchRequest', () => {
  it('reads a query string, ten files by default', () => {
    expect(searchRequest.parse({ q: 'semafor' })).toEqual({
      q: 'semafor',
      limit: 10,
    });
    expect(
      searchRequest.parse({ q: 'Čačak', course: 'os', limit: '50' }),
    ).toEqual({ q: 'Čačak', course: 'os', limit: 50 });
  });

  it('refuses words too short or too long, and limits out of bounds', () => {
    for (const request of [
      {},
      { q: 'a' },
      { q: 'a'.repeat(501) },
      { q: ['semafor', 'mreža'] },
      { q: 'semafor', limit: '0' },
      { q: 'semafor', limit: '51' },
      { q: 'semafor', course: 'Not A Slug' },
    ])
      expect(searchRequest.safeParse(request).success).toBe(false);
  });
});
