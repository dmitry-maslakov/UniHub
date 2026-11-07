import { TooManyPicksError } from './errors.js';
import { checkRoom, MAX_PICKS, pickedIn } from './picks.js';

const picks = (n: number) => Array.from({ length: n }, (_, i) => `pc-${i}`);

describe('checkRoom', () => {
  it(`takes picks up to ${MAX_PICKS}, and none past it`, () => {
    expect(() => checkRoom(picks(MAX_PICKS - 1), 'new')).not.toThrow();
    expect(() => checkRoom(picks(MAX_PICKS), 'new')).toThrow(
      new TooManyPicksError(MAX_PICKS),
    );
  });

  it('takes a course picked already again, at the limit too: no new pick', () => {
    expect(() => checkRoom(picks(MAX_PICKS), 'pc-7')).not.toThrow();
  });
});

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
