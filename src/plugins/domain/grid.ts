import { createHash } from 'node:crypto';

// Each user's own account passes on a grid of its own (README, Portal
// accounts): every `everyMs`, at an offset its id gives, so the accounts'
// passes spread over the period, and when one passes says nothing of what
// another's does or what the hub had.
export interface Grid {
  everyMs: number;
  // 1 to everyMs: BullMQ takes 0 for no offset, and picks one itself by
  // when the schedule is set; a whole period is the same slots as none
  offsetMs: number;
}

export function gridOf(account: string, everyMs: number): Grid {
  const hash = createHash('sha256').update(account).digest().readUInt32BE(0);
  return { everyMs, offsetMs: hash % everyMs || everyMs };
}

// the slot a run is of: the latest point on the grid not after its start
export function slotOf(start: Date, { everyMs, offsetMs }: Grid) {
  const offset = offsetMs % everyMs;
  const since = start.getTime() - offset;
  return new Date(Math.floor(since / everyMs) * everyMs + offset);
}
