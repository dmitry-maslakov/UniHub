import type { LeftOut } from './unpacking.js';

const MiB = 1024 * 1024;

// The hub's limits on one walk of a container, the tree it makes and every
// container in it: raise `policy` with any change, so trees are made again.
export const LIMITS = {
  policy: 1,
  // members listed
  members: 10_000,
  // bytes stored, all members together
  bytes: 256 * MiB,
  // bytes of one member
  memberBytes: 100 * MiB,
  // containers in containers: the root is 0, one in it 1
  depth: 3,
};

// One per walk, deterministic per content: the same container walks the
// same way. What it counts are the bytes actually stored, whatever sizes the
// containers declare, so entries that overlap or lie can't take more.
export class TreeBudget {
  private listed = 0;
  private stored = 0;
  // of one member: storage's own limit when that's less
  private readonly most: number;

  constructor(
    storeMax: number,
    private readonly limits = LIMITS,
  ) {
    this.most = Math.min(limits.memberBytes, storeMax);
  }

  // past limits.members: the rest isn't listed
  get full() {
    return this.listed >= this.limits.members;
  }

  // Counts a member as listed: the bytes it may take, or why it's left out
  // unread by the size it declares.
  admit(declared: number | null): number | LeftOut {
    this.listed++;
    const left = this.limits.bytes - this.stored;
    if (declared !== null && declared > this.most) return 'TOO_LARGE';
    if (left <= 0 || (declared !== null && declared > left))
      return 'OVER_BUDGET';
    return Math.min(this.most, left);
  }

  // why a member that came out past what admit() gave is left out
  past(limit: number): LeftOut {
    return limit < this.most ? 'OVER_BUDGET' : 'TOO_LARGE';
  }

  spent(bytes: number) {
    this.stored += bytes;
  }

  // whether a container this deep is opened
  opens(depth: number) {
    return depth < this.limits.depth;
  }
}
