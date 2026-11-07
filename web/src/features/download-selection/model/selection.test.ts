import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  boxState,
  keyOf,
  useBox,
  useSelection,
  useTicked,
  type Selection,
  type Target,
} from './selection';

const file = (id: string, size: number | null = 10): Target => ({
  file: id,
  size,
});
const member = (id: string, path: string, size = 5): Target => ({
  file: id,
  member: path,
  size,
});

describe('keyOf', () => {
  it("is a file's id, and a member's after its archive's", () => {
    expect(keyOf(file('f1'))).toBe('f1');
    expect(keyOf(member('f1', 'lab/a.c'))).toBe('f1\u0000lab/a.c');
  });
});

describe('boxState', () => {
  const [a, b] = [file('a'), file('b')];

  it('is checked when all its files are, and between when some are', () => {
    expect(boxState([a, b], () => true)).toEqual({
      checked: true,
      indeterminate: false,
    });
    expect(boxState([a, b], (t) => t === a)).toEqual({
      checked: false,
      indeterminate: true,
    });
    expect(boxState([a, b], () => false)).toEqual({
      checked: false,
      indeterminate: false,
    });
  });

  it('has no box for a folder without files to tick', () => {
    expect(boxState([], () => true)).toBeNull();
  });
});

describe('useSelection', () => {
  const all = [file('a', 10), file('b', null), file('c', 5)];
  const members = [
    file('f1'),
    member('f1', 'lab/a.c'),
    member('f1', 'lab/b.c'),
  ];
  const ticked = (selection: Selection) =>
    renderHook(() => useTicked(selection)).result.current;

  it('toggles a file and a member apart, in the order ticked', () => {
    const { result } = renderHook(() => useSelection(members));
    const selection = result.current;
    act(() => selection.toggle(members[0]!));
    act(() => selection.toggle(members[1]!));

    expect(selection.has(members[0]!)).toBe(true);
    expect(selection.has(members[1]!)).toBe(true);
    expect(selection.has(members[2]!)).toBe(false);
    expect(ticked(selection).items).toEqual([
      { file: 'f1' },
      { file: 'f1', member: 'lab/a.c' },
    ]);

    act(() => selection.toggle(members[0]!));
    expect(ticked(selection).items).toEqual([
      { file: 'f1', member: 'lab/a.c' },
    ]);
  });

  it('ticks and clears a folder at once, or everything', () => {
    const { result } = renderHook(() => useSelection(all));
    const selection = result.current;

    act(() => selection.setMany(all, true));
    expect(ticked(selection).items).toHaveLength(3);
    // a size not known counts for none
    expect(ticked(selection).size).toBe(15);
    // ticking again changes nothing
    act(() => selection.setMany(all.slice(0, 1), true));
    expect(ticked(selection).items).toHaveLength(3);

    act(() => selection.setMany([all[0]!, all[2]!], false));
    expect(ticked(selection).items).toEqual([{ file: 'b' }]);

    act(() => selection.clear());
    expect(ticked(selection)).toEqual({ items: [], size: 0 });
  });

  it('drops what the page no longer shows', () => {
    const { result, rerender } = renderHook(
      ({ targets }) => useSelection(targets),
      { initialProps: { targets: all } },
    );
    const selection = result.current;
    act(() => selection.setMany(all, true));

    rerender({ targets: all.slice(1) });

    expect(ticked(selection).items).toEqual([{ file: 'b' }, { file: 'c' }]);
  });
});

describe('useBox', () => {
  it('re-renders only for its own targets', () => {
    const [a, b] = [file('a'), file('b')];
    const { result: selected } = renderHook(() => useSelection([a, b]));
    const selection = selected.current;
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useBox(selection, [a]);
    });
    expect(result.current).toEqual({ checked: false, indeterminate: false });
    const before = renders;

    act(() => selection.toggle(b));
    expect(renders).toBe(before);

    act(() => selection.toggle(a));
    expect(result.current).toEqual({ checked: true, indeterminate: false });
    expect(renders).toBe(before + 1);
  });
});
