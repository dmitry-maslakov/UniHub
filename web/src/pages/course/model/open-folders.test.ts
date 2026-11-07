import { afterEach, describe, expect, it, vi } from 'vitest';
import { readOpen, startOpen, writeOpen } from './open-folders';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const few = ['Predavanja', 'Vežbe'];
const many = Array.from({ length: 9 }, (_, i) => `folder ${i}`);

describe('open folders', () => {
  it('opens the top level when there are few folders', () => {
    expect([...startOpen(null, few)]).toEqual(few);
    expect([...startOpen(null, many.slice(0, 8))]).toHaveLength(8);
    expect(startOpen(null, many).size).toBe(0);
  });

  it('remembers what was opened and closed', () => {
    writeOpen('os', new Set(['Vežbe', 'Vežbe/2026', 'a1b2']));
    expect(localStorage.getItem('unihub.course.os.open')).toBe(
      '["Vežbe","Vežbe/2026","a1b2"]',
    );
    // what was saved wins over the default, even an empty list
    expect([...startOpen(readOpen('os'), few)]).toEqual([
      'Vežbe',
      'Vežbe/2026',
      'a1b2',
    ]);
    writeOpen('os', new Set());
    expect(startOpen(readOpen('os'), few).size).toBe(0);
    // another course has its own
    expect(readOpen('net')).toBeNull();
  });

  it('works without storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readOpen('os')).toBeNull();
    expect(() => writeOpen('os', new Set(['a']))).not.toThrow();
    expect([...startOpen(readOpen('os'), few)]).toEqual(few);
  });

  it('ignores what was saved that is not a list', () => {
    localStorage.setItem('unihub.course.os.open', '{"a":1}');
    expect(readOpen('os')).toBeNull();
    localStorage.setItem('unihub.course.os.open', 'not json');
    expect(readOpen('os')).toBeNull();
  });
});
