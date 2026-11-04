import { recordId, textQuery } from './requests.js';

describe('textQuery', () => {
  it("reads a text's page and processor from a query string", () => {
    expect(textQuery.parse({})).toEqual({ page: 1 });
    expect(textQuery.parse({ page: '2', processor: 'zz-ocr' })).toEqual({
      page: 2,
      processor: 'zz-ocr',
    });
  });

  it('refuses a page out of bounds, or a processor that is none, or two', () => {
    for (const query of [
      { page: '0' },
      { page: '99999999999' },
      { processor: ['a', 'b'] },
      { processor: 'Not One' },
    ])
      expect(textQuery.safeParse(query).success).toBe(false);
  });
});

describe('recordId', () => {
  it('is text postgres can look up', () => {
    for (const bad of ['', 'a\u0000b'])
      expect(recordId.safeParse(bad).success).toBe(false);
  });
});
