import { ReadScope } from './read-scope.js';

describe('ReadScope', () => {
  it('allows every course, none, or the ones it names', () => {
    expect(ReadScope.all().allows('c1')).toBe(true);
    expect(ReadScope.none().allows('c1')).toBe(false);
    const some = ReadScope.of(['c1', 'c2']);
    expect(['c1', 'c2', 'c3'].map((id) => some.allows(id))).toEqual([
      true,
      true,
      false,
    ]);
    expect([ReadScope.all().granted, some.granted]).toEqual([
      null,
      ['c1', 'c2'],
    ]);
  });

  it('reads through accounts of their own unless it is a ban', () => {
    expect(ReadScope.all().ownAccounts).toBe(true);
    // granted nothing is still someone's own accounts
    expect(ReadScope.of([]).ownAccounts).toBe(true);
    expect(ReadScope.none()).toMatchObject({ ownAccounts: false, granted: [] });
  });
});
