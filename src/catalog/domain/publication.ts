// When what an account's pass found shows (README, Portal accounts): at
// its slot on the account's grid plus a delay, whatever the pass did, so
// how long it took, and whether the hub had it all already, tell no one
// anything; a pass that ends past that shows at the next slot. Content
// opens a hold after that, the same for content new to the hub and content
// it had. The shared account's shows at once.
export interface Publishing {
  delayMs: number;
  // the account's grid, one slot after another
  slotMs: number;
  holdMs: number;
}

export interface Shown {
  shownFrom: Date;
  openFrom: Date;
}

export function publication(
  slot: Date,
  ended: Date,
  { delayMs, slotMs, holdMs }: Publishing,
): Shown {
  let shown = slot.getTime() + delayMs;
  while (ended.getTime() > shown) shown += slotMs;
  return { shownFrom: new Date(shown), openFrom: new Date(shown + holdMs) };
}

// the shared account's: shown and open as soon as it's sent
export const atOnce = (at = new Date()): Shown => ({
  shownFrom: at,
  openFrom: at,
});
