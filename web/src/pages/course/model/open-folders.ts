import { useState } from 'react';

// the top level starts open when it has this many folders or fewer
const OPEN_TOP_UP_TO = 8;

const keyOf = (slug: string) => `unihub.course.${slug}.open`;

// What a course had open, as the folder paths and archive ids last saved;
// null when nothing was saved or storage isn't there
export function readOpen(slug: string): string[] | null {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(keyOf(slug)) ?? 'null',
    );
    return Array.isArray(saved)
      ? saved.filter((id) => typeof id === 'string')
      : null;
  } catch {
    return null;
  }
}

export function writeOpen(slug: string, open: ReadonlySet<string>) {
  try {
    localStorage.setItem(keyOf(slug), JSON.stringify([...open]));
  } catch {
    // the page works without storage
  }
}

// What a course starts with: what was saved, else its top-level folders
// when there are few of them
export const startOpen = (
  saved: readonly string[] | null,
  top: readonly string[],
) => new Set(saved ?? (top.length <= OPEN_TOP_UP_TO ? top : []));

// What is open in a course's tree: read once on mount, written on each
// toggle. `isOpen` is for a row's start; a row keeps its own state after.
export function useOpenFolders(slug: string, top: readonly string[]) {
  const [open] = useState(() => startOpen(readOpen(slug), top));
  return {
    isOpen: (id: string) => open.has(id),
    toggle: (id: string, opened: boolean) => {
      if (opened) open.add(id);
      else open.delete(id);
      writeOpen(slug, open);
    },
  };
}
