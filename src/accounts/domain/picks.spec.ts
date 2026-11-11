import { pickedIn } from './picks.js';

describe('pickedIn', () => {
  it("finds the user's picks in each catalog, and none of what no catalog has", () => {
    const catalogs = new Map([
      ['catalog', [{ id: 'pc-os' }, { id: 'pc-net' }]],
      ['site', [{ id: 'pc-math' }]],
    ]);
    expect(pickedIn(catalogs, ['pc-net', 'pc-gone', 'pc-math'])).toEqual(
      new Map([
        ['catalog', ['pc-net']],
        ['site', ['pc-math']],
      ]),
    );
    expect(pickedIn(catalogs, [])).toEqual(
      new Map([
        ['catalog', []],
        ['site', []],
      ]),
    );
  });
});
