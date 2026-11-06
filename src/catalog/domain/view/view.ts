import { createHash } from 'node:crypto';
import stringify from 'fast-json-stable-stringify';

// An account's view, as a pass changes it (README, Portal accounts).

// A record as an account saw it, the same for all who saw it alike: the
// hash of what it is, whatever order its keys came in
export const fingerprintOf = (record: object) =>
  createHash('sha256').update(stringify(record)).digest('hex');

// a version an account sees, and whether it may open it
export interface Sighting {
  recordId: string;
  versionId: string;
  open: boolean;
}

export interface ViewChange {
  // versions it sees from now on
  show: Sighting[];
  // versions it saw and sees still, locked or unlocked since
  reopen: Sighting[];
  // versions it no longer sees: another version of their record came, or
  // the record is gone from its view
  hide: Sighting[];
}

// What a pass makes of the account's view: what it sent, and of what it
// saw before only the records `kept` names (a listing that failed), unless
// the pass sent them as another version.
export function viewChange(
  before: readonly Sighting[],
  sent: readonly Sighting[],
  kept: ReadonlySet<string> = new Set(),
): ViewChange {
  const seen = new Map(before.map((s) => [s.versionId, s]));
  const sentVersions = new Set(sent.map((s) => s.versionId));
  const sentRecords = new Set(sent.map((s) => s.recordId));
  return {
    show: sent.filter((s) => !seen.has(s.versionId)),
    reopen: sent.filter((s) => {
      const had = seen.get(s.versionId);
      return had !== undefined && had.open !== s.open;
    }),
    hide: before.filter(
      (s) =>
        !sentVersions.has(s.versionId) &&
        (sentRecords.has(s.recordId) || !kept.has(s.recordId)),
    ),
  };
}
