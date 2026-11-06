import { atOnce, publication } from './publication.js';

const minutes = (n: number) => n * 60_000;
const at = (minute: number) => new Date(Date.UTC(2026, 10, 6, 10, minute));
const timing = {
  delayMs: minutes(10),
  slotMs: minutes(60),
  holdMs: minutes(15),
};

describe('publication', () => {
  it('shows a pass at its slot and the delay, however long it took, and opens it a hold after', () => {
    for (const ended of [at(1), at(9), at(10)])
      expect(publication(at(0), ended, timing)).toEqual({
        shownFrom: at(10),
        openFrom: at(25),
      });
  });

  it('shows a pass that ends past that at the next slot, or the one after', () => {
    expect(publication(at(0), at(11), timing).shownFrom).toEqual(at(70));
    expect(publication(at(0), new Date(at(70).getTime() + 1), timing)).toEqual({
      shownFrom: at(130),
      openFrom: at(145),
    });
  });

  it("shows the shared account's at once", () => {
    expect(atOnce(at(3))).toEqual({ shownFrom: at(3), openFrom: at(3) });
  });
});
