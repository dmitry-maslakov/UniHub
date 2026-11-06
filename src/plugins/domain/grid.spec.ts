import { gridOf, slotOf } from './grid.js';

const HOUR = 60 * 60_000;

describe("an account's grid", () => {
  it('is the same for the account every time, and spreads accounts over the period', () => {
    expect(gridOf('ana', HOUR)).toEqual(gridOf('ana', HOUR));
    const offsets = new Set(
      Array.from(
        { length: 50 },
        (_, i) => gridOf(`account-${i}`, HOUR).offsetMs,
      ),
    );
    expect(offsets.size).toBeGreaterThan(45);
    for (const offset of offsets) {
      expect(offset).toBeGreaterThan(0);
      expect(offset).toBeLessThanOrEqual(HOUR);
    }
  });

  it('gives a run the latest slot not after its start, a late one too', () => {
    const grid = { everyMs: HOUR, offsetMs: 17 * 60_000 };
    const slot = new Date('2026-11-06T12:17:00Z');
    for (const start of ['2026-11-06T12:17:00Z', '2026-11-06T13:16:59Z'])
      expect(slotOf(new Date(start), grid)).toEqual(slot);
    expect(slotOf(new Date('2026-11-06T12:16:59Z'), grid)).toEqual(
      new Date('2026-11-06T11:17:00Z'),
    );
    // a whole period's offset is none
    expect(
      slotOf(new Date('2026-11-06T12:30:00Z'), {
        everyMs: HOUR,
        offsetMs: HOUR,
      }),
    ).toEqual(new Date('2026-11-06T12:00:00Z'));
  });
});
