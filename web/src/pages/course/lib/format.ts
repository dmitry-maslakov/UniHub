const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

export const day = (value: string | null) =>
  value ? date.format(new Date(value)) : undefined;

// 1.4 MB, as a file manager says it
export function fileSize(bytes: number | null) {
  if (bytes === null) return undefined;
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1000 && unit < units.length - 1) {
    size /= 1000;
    unit += 1;
  }
  return `${unit ? size.toFixed(1) : size} ${units[unit]}`;
}
