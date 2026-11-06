import { memberSchema, pageSchema, textPageSchema } from './page.js';

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

describe('textPageSchema', () => {
  it("reads a text's page and processor from a query string, the first text's page 1 by default", () => {
    expect(textPageSchema.parse({})).toEqual({ page: 1 });
    expect(textPageSchema.parse({ page: '3', processor: 'zz-ocr' })).toEqual({
      page: 3,
      processor: 'zz-ocr',
    });
  });

  it('stays within what postgres takes, and takes one processor', () => {
    for (const page of ['0', '2147483648', ['1', '2']])
      expect(textPageSchema.safeParse({ page }).success).toBe(false);
    expect(textPageSchema.safeParse({ processor: ['a', 'b'] }).success).toBe(
      false,
    );
  });
});

describe('memberSchema', () => {
  it("takes one member's path, as long as the hub keeps one", () => {
    expect(memberSchema.parse({})).toEqual({});
    expect(memberSchema.parse({ member: 'lab/main.c' })).toEqual({
      member: 'lab/main.c',
    });
    for (const member of ['', 'a'.repeat(1025), ['a.c', 'b.c'], 'a\u0000.c'])
      expect(memberSchema.safeParse({ member }).success).toBe(false);
  });

  it('composes its letters, as the hub keeps them', () => {
    expect(memberSchema.parse({ member: 'Ve\u017ebe/c\u030cas.c' })).toEqual({
      member: 'Ve\u017ebe/\u010das.c',
    });
  });
});
