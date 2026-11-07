import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { boxState, keyOf, useSelection, type Target } from './selection';

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
  it('toggles a file and a member apart, in the order ticked', () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.toggle(file('f1')));
    act(() => result.current.toggle(member('f1', 'lab/a.c')));

    expect(result.current.has(file('f1'))).toBe(true);
    expect(result.current.has(member('f1', 'lab/a.c'))).toBe(true);
    expect(result.current.has(member('f1', 'lab/b.c'))).toBe(false);
    expect(result.current.items).toEqual([
      { file: 'f1' },
      { file: 'f1', member: 'lab/a.c' },
    ]);

    act(() => result.current.toggle(file('f1')));
    expect(result.current.items).toEqual([{ file: 'f1', member: 'lab/a.c' }]);
  });

  it('ticks and clears a folder at once, or everything', () => {
    const { result } = renderHook(() => useSelection());
    const all = [file('a', 10), file('b', null), file('c', 5)];

    act(() => result.current.setMany(all, true));
    expect(result.current.items).toHaveLength(3);
    // a size not known counts for none
    expect(result.current.size).toBe(15);
    // ticking again changes nothing
    act(() => result.current.setMany(all.slice(0, 1), true));
    expect(result.current.items).toHaveLength(3);

    act(() => result.current.setMany([all[0]!, all[2]!], false));
    expect(result.current.items).toEqual([{ file: 'b' }]);

    act(() => result.current.clear());
    expect(result.current.items).toEqual([]);
    expect(result.current.size).toBe(0);
  });
});
