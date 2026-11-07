import { useMemo, useState } from 'react';

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

// What a page has ticked, kept in the order it was ticked
export function useSelection() {
  const [ticked, setTicked] = useState<ReadonlyMap<string, Target>>(
    () => new Map(),
  );
  return useMemo(() => {
    const change = (targets: readonly Target[], on: boolean) =>
      setTicked((before) => {
        const after = new Map(before);
        for (const target of targets)
          if (on) after.set(keyOf(target), target);
          else after.delete(keyOf(target));
        return after;
      });
    return {
      has: (target: Target) => ticked.has(keyOf(target)),
      toggle: (target: Target) => change([target], !ticked.has(keyOf(target))),
      setMany: change,
      clear: () => setTicked(new Map()),
      items: [...ticked.values()].map(({ file, member }) =>
        member === undefined ? { file } : { file, member },
      ),
      // together, as far as sizes are known
      size: [...ticked.values()].reduce((sum, t) => sum + (t.size ?? 0), 0),
    };
  }, [ticked]);
}

export type Selection = ReturnType<typeof useSelection>;
