import { TooManyPicksError } from './errors.js';
import { checkRoom, MAX_PICKS } from './picks.js';

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
