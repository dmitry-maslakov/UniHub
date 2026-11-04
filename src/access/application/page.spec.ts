import { pageSchema, textPage } from './page.js';

describe('pageSchema', () => {
  it('reads a query string, with defaults', () => {
    expect(pageSchema.parse({})).toEqual({ offset: 0, limit: 50 });
    expect(pageSchema.parse({ offset: '20', limit: '10' })).toEqual({
      offset: 20,
      limit: 10,
    });
  });

  it('refuses what is out of bounds or not one number', () => {
    for (const page of [
      { limit: '201' },
      { limit: '0' },
      { offset: '-1' },
      { offset: '1.5' },
      { offset: '99999999999999999999' },
      { offset: ['1', '2'] },
      { limit: 'ten' },
    ])
      expect(pageSchema.safeParse(page).success).toBe(false);
  });
});

describe('textPage', () => {
  it('starts at 1 and stays within what postgres takes', () => {
    expect(textPage.parse(undefined)).toBe(1);
    expect(textPage.parse('3')).toBe(3);
    for (const page of ['0', '2147483648', ['1', '2']])
      expect(textPage.safeParse(page).success).toBe(false);
  });
});
