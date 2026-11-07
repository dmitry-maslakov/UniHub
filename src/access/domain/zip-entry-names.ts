import { parse } from 'node:path/posix';

// What a zip entry is named after: a file by its folder and name, a member
// of an archive by the archive's folder and name (less its last extension)
// and its own path in it.
export type ZipItem = { path: string } & (
  { name: string } | { archive: string; member: string }
);

// A zip's entry names are paths a client unpacks under a folder of its
// own, and yazl refuses an absolute one or one that climbs out. Whatever a
// portal or an archive called something, only its plain segments are kept.
const segments = (path: string) =>
  path.split(/[\\/]/).filter((s) => s !== '' && s !== '.' && s !== '..');

const stem = (name: string) => {
  const parts = segments(name);
  const last = parts.pop();
  return last === undefined ? [] : [...parts, parse(last).name];
};

const pathOf = (item: ZipItem) => {
  const all =
    'member' in item
      ? [
          ...segments(item.path),
          ...stem(item.archive),
          ...segments(item.member),
        ]
      : [...segments(item.path), ...segments(item.name)];
  if (!all.length) all.push('file');
  // "C:" at the front would be a drive to a client on Windows
  all[0] = all[0]!.replace(/^([a-zA-Z]):/, '$1_');
  return all;
};

// One name for each item, in order. A name taken already, whatever its case
// (a client may unpack onto a disk that ignores it), gets " (2)", " (3)"
// and so on before its extension.
export function zipEntryNames(items: readonly ZipItem[]): string[] {
  const taken = new Set<string>();
  return items.map((item) => {
    const folders = pathOf(item);
    const leaf = folders.pop()!;
    const { name, ext } = parse(leaf);
    for (let n = 1; ; n++) {
      const entry = [...folders, n === 1 ? leaf : `${name} (${n})${ext}`].join(
        '/',
      );
      if (!taken.has(entry.toLowerCase())) {
        taken.add(entry.toLowerCase());
        return entry;
      }
    }
  });
}
