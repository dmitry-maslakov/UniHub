const byName = new Intl.Collator('und', { numeric: true });
const time = ({ changedAt }: { changedAt: string | null }) =>
  changedAt === null ? -Infinity : Date.parse(changedAt);

// Files by their date on the portal, newest first, the undated last; the
// same date, or none, by folder then name, numbers as people count them
// (two undated subtract to NaN, which || passes over to the names)
export const newestFirst = <
  F extends { changedAt: string | null; path: string; name: string },
>(
  files: readonly F[],
): F[] =>
  files.toSorted(
    (a, b) =>
      time(b) - time(a) ||
      byName.compare(a.path, b.path) ||
      byName.compare(a.name, b.name),
  );
