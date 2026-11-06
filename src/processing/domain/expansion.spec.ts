import { Stored } from './expansion.js';

describe('Stored', () => {
  const caps = { entries: 2, bytes: 10 };

  it('takes entries up to what storage keeps of one content', () => {
    const stored = new Stored(4, caps);
    expect([stored.fits(4), stored.fits(5)]).toEqual([true, false]);
  });

  it('takes entries up to the bytes in all, one past it left out and the next looked at', () => {
    const stored = new Stored(10, caps);
    stored.add(6);
    expect([stored.fits(5), stored.fits(4)]).toEqual([false, true]);
  });

  it('takes an entry of no known size while there is room left', () => {
    const stored = new Stored(10, caps);
    expect(stored.fits()).toBe(true);
    stored.add(10);
    expect(stored.fits()).toBe(true);
    stored.add(1);
    expect(stored.fits()).toBe(false);
  });

  it('closes past the entries in all', () => {
    const stored = new Stored(10, caps);
    stored.add(1);
    expect(stored.open).toBe(true);
    stored.add(1);
    expect(stored.open).toBe(false);
  });
});
