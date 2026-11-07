// how far back a file counts as new
export const NEW_DAYS = 14;
const DAY_MS = 86_400_000;

// New: its portal changed it in the last 14 days (or dates it ahead of
// now). Without a date, never: the hub's own times say when it read a
// file, not when the portal changed it
export const isNew = ({ changedAt }: { changedAt: string | null }, now: Date) =>
  changedAt !== null &&
  Date.parse(changedAt) >= now.getTime() - NEW_DAYS * DAY_MS;
