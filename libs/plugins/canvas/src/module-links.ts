import type { ModuleItem } from './canvas.types.js';

// what the modules link to of one type, each once
export const linked = <K extends 'page_url' | 'content_id'>(
  items: ModuleItem[],
  type: string,
  key: K,
) =>
  new Set(
    items
      .filter((item) => item.type === type)
      .map((item) => item[key] as NonNullable<ModuleItem[K]>),
  );

// The ids of what the modules link to, read one by one; none for the
// source when one was refused, so it keeps what it had, the rest read
// all the same.
export async function readEach<T>(
  keys: Iterable<T>,
  read: (key: T) => Promise<string | null>,
) {
  const ids: string[] = [];
  let refused = false;
  for (const key of keys) {
    const id = await read(key);
    if (id) ids.push(id);
    else refused = true;
  }
  return refused ? undefined : ids;
}
