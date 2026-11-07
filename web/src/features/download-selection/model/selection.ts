import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

// What can be ticked: a file, or a file inside an archive (`member`, its
// path there), with the size it is shown with
export interface Target {
  file: string;
  member?: string;
  size: number | null;
}

// the items of one download, as POST /api/downloads takes them
export const MAX_ITEMS = 500;

// the key of a target: a file's id, a member's after its archive's
export const keyOf = ({ file, member }: Pick<Target, 'file' | 'member'>) =>
  member === undefined ? file : `${file}\u0000${member}`;

export interface BoxState {
  checked: boolean;
  indeterminate: boolean;
}

// A folder's box from the targets under it: checked when all are ticked,
// in between when some are. A folder with none has no box.
export function boxState(
  targets: readonly Target[],
  has: (target: Target) => boolean,
): BoxState | null {
  if (!targets.length) return null;
  const ticked = targets.filter(has).length;
  return {
    checked: ticked === targets.length,
    indeterminate: ticked > 0 && ticked < targets.length,
  };
}

type Ticked = ReadonlyMap<string, Target>;

// What is ticked, kept in the order it was ticked, outside React's render
// so a box re-renders alone when its own state changes (useBox), not the
// whole tree: the store is the same for the page's life.
function createStore() {
  let ticked: Ticked = new Map();
  const listeners = new Set<() => void>();
  const set = (next: Ticked) => {
    ticked = next;
    for (const listener of listeners) listener();
  };
  const change = (targets: readonly Target[], on: boolean) => {
    const after = new Map(ticked);
    for (const target of targets)
      if (on) after.set(keyOf(target), target);
      else after.delete(keyOf(target));
    set(after);
  };
  return {
    snapshot: () => ticked,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    has: (target: Target) => ticked.has(keyOf(target)),
    toggle: (target: Target) => change([target], !ticked.has(keyOf(target))),
    setMany: change,
    clear: () => set(new Map()),
    // drops what is no longer among `live` keys
    // (a member lives as long as its archive does)
    keepOnly: (live: ReadonlySet<string>) => {
      const kept = [...ticked].filter(
        ([key, t]) =>
          live.has(key) || (t.member !== undefined && live.has(t.file)),
      );
      if (kept.length !== ticked.size) set(new Map(kept));
    },
  };
}

// What a page has ticked, of the `targets` it shows now: a file a sync
// took away stops being ticked (it could only be refused).
export function useSelection(targets: readonly Target[]) {
  const [store] = useState(createStore);
  useEffect(
    () => store.keepOnly(new Set(targets.map(keyOf))),
    [store, targets],
  );
  return store;
}

export type Selection = ReturnType<typeof useSelection>;

// what is ticked now, to download
export function useTicked(selection: Selection) {
  const ticked = useSyncExternalStore(selection.subscribe, selection.snapshot);
  return useMemo(
    () => ({
      items: [...ticked.values()].map(({ file, member }) =>
        member === undefined ? { file } : { file, member },
      ),
      // together, as far as sizes are known
      size: [...ticked.values()].reduce((sum, t) => sum + (t.size ?? 0), 0),
    }),
    [ticked],
  );
}

// the same few states, so a box's snapshot is one primitive
const BOXES = {
  none: null,
  off: { checked: false, indeterminate: false },
  some: { checked: false, indeterminate: true },
  on: { checked: true, indeterminate: false },
} as const;

// The box over `targets` (a folder's, or all of a page's), re-rendering
// its component only when its own state changes
export function useBox(
  selection: Selection,
  targets: readonly Target[],
): BoxState | null {
  const state = useSyncExternalStore(selection.subscribe, () => {
    const box = boxState(targets, selection.has);
    return box
      ? box.checked
        ? 'on'
        : box.indeterminate
          ? 'some'
          : 'off'
      : 'none';
  });
  return BOXES[state];
}
