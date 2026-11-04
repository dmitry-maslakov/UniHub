import { textQuery } from './requests.js';

// what the query adds to its values (page.spec, the kernel's specs): its
// shape and its defaults
describe('textQuery', () => {
  it("reads a text's page and processor from a query string", () => {
    expect(textQuery.parse({})).toEqual({ page: 1 });
    expect(textQuery.parse({ page: '2', processor: 'zz-ocr' })).toEqual({
      page: 2,
      processor: 'zz-ocr',
    });
  });

  it('refuses two processors', () => {
    expect(textQuery.safeParse({ processor: ['a', 'b'] }).success).toBe(false);
  });
});
